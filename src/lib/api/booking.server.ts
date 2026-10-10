/**
 * Booking orchestration: quotes → bookings → matching/assignment → trip
 * lifecycle → completion & ledgers. All authority lives here (server-side).
 */
import { AppError, audit, db, loadPricing, newToken, notify, routingFor, transitionBooking } from "./core.server";
import { haversineM, type LatLng } from "@/lib/domain/geo";
import { findMatches, type MatchOption, type RiderSpec, type Stop, type TripCandidate } from "@/lib/domain/matching";
import {
  ALLOCATION_METHOD,
  driverGrossPayout,
  nextGuaranteed,
  privateFare,
  quoteAmounts,
  type PricingConfig,
  type RideMode,
  type VehicleType,
} from "@/lib/domain/pricing";
import { cancellationOutcome, canMarkNoShow } from "@/lib/domain/cancellation";
import type { ActorRole, BookingState } from "@/lib/domain/state-machine";
import { applyBps } from "@/lib/domain/money";

const SHARED_MODES: RideMode[] = ["SHARE_AND_SAVE", "SHARED_NOW", "BUDGET"];
const ACTIVE_TRIP = ["planned", "driver_en_route", "in_progress"];
const PROPOSAL_TTL_S = 120;

export interface QuoteInput {
  pickup: { label: string; lat: number; lng: number };
  dropoff: { label: string; lat: number; lng: number };
  mode: RideMode;
  passengerCount: number;
  vehicleType: VehicleType;
  budgetPaise?: number;
  departAt?: string;
  maxDetourPct: number;
  category?: string | null;
}

async function assertServiceable(p: LatLng) {
  const { data } = await db().from("service_areas").select("config,status").neq("status", "inactive");
  const ok = (data ?? []).some((a: { config: { bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } } }) => {
    const b = a.config.bbox;
    return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
  });
  if (!ok) throw new AppError("NOT_SERVICEABLE", "This location is outside the (demo) service area.");
}

async function assertCategory(code: string | null | undefined) {
  if (!code) return;
  const { data } = await db().from("category_rules").select("status,label").eq("code", code).maybeSingle();
  if (!data) throw new AppError("CATEGORY_UNKNOWN");
  if (data.status !== "available") throw new AppError("CATEGORY_UNAVAILABLE", `${data.label} is not available yet (pending legal/operational review). We never substitute a category silently.`);
}

// ---------- Trip candidate loading ----------
async function loadCandidate(trip: { id: string; driver_id: string; vehicle_id: string; is_shared: boolean; state: string; category: string | null; planned_start: string; version: number }): Promise<TripCandidate | null> {
  const [{ data: drv }, { data: veh }, { data: tbs }, { data: stops }] = await Promise.all([
    db().from("driver_profiles").select("*").eq("id", trip.driver_id).single(),
    db().from("vehicles").select("*").eq("id", trip.vehicle_id).single(),
    db().from("trip_bookings").select("booking_id,assignment_state").eq("trip_id", trip.id).in("assignment_state", ["proposed", "confirmed"]),
    db().from("trip_stops").select("*").eq("trip_id", trip.id).eq("status", "pending").order("seq"),
  ]);
  if (!drv || !veh) return null;
  const ids = (tbs ?? []).map((t: { booking_id: string }) => t.booking_id);
  const { data: bks } = ids.length ? await db().from("bookings").select("*").in("id", ids) : { data: [] };
  const riders: RiderSpec[] = (bks ?? []).map((b: Booking) => ({
    bookingId: b.id,
    count: b.passenger_count,
    pickup: { lat: b.pickup_lat, lng: b.pickup_lng },
    dropoff: { lat: b.dropoff_lat, lng: b.dropoff_lng },
    maxDetourPct: b.max_detour_pct,
    soloDistanceM: b.solo_distance_m,
    soloFare: Number(b.private_reference_fare),
    cap: Number(b.current_guaranteed_payable),
    onboard: ["PASSENGER_ONBOARD", "IN_PROGRESS"].includes(b.state),
  }));
  const restricted = drv.restricted_until && new Date(drv.restricted_until) > new Date();
  return {
    tripId: trip.id,
    driverId: trip.driver_id,
    vehicleType: veh.vehicle_type,
    capacity: veh.seating_capacity,
    joinable: trip.is_shared && trip.state !== "in_progress" ? true : trip.is_shared && riders.some((r) => r.onboard) ? true : trip.is_shared,
    driverEligible: drv.verification_status === "verified" && veh.verification_status === "verified" && !restricted,
    category: trip.category,
    departAt: Math.max(new Date(trip.planned_start).getTime(), Date.now()),
    driverLocation: { lat: drv.current_lat ?? riders[0]?.pickup.lat ?? 0, lng: drv.current_lng ?? riders[0]?.pickup.lng ?? 0 },
    riders,
    stops: (stops ?? []).map((s: { booking_id: string; stop_type: "pickup" | "dropoff"; lat: number; lng: number }) => ({ bookingId: s.booking_id, type: s.stop_type, point: { lat: s.lat, lng: s.lng } })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Booking = any;

function requestFromBooking(b: Booking, capOverride?: number) {
  return {
    bookingId: b.id,
    count: b.passenger_count,
    pickup: { lat: b.pickup_lat, lng: b.pickup_lng },
    dropoff: { lat: b.dropoff_lat, lng: b.dropoff_lng },
    maxDetourPct: b.max_detour_pct,
    soloDistanceM: b.solo_distance_m,
    soloFare: Number(b.private_reference_fare),
    cap: capOverride ?? Number(b.current_guaranteed_payable),
    category: b.category_preference ?? null,
    windowStart: new Date(b.window_start).getTime(),
    windowEnd: new Date(b.window_end).getTime(),
  };
}

async function sharedCandidates(onlyTripId?: string | null) {
  let q = db().from("trips").select("*").eq("is_shared", true).in("state", ["planned", "driver_en_route", "in_progress"]).limit(50);
  if (onlyTripId) q = q.eq("id", onlyTripId);
  const { data } = await q;
  const out: { cand: TripCandidate; version: number }[] = [];
  for (const t of data ?? []) {
    const c = await loadCandidate(t);
    if (c) out.push({ cand: c, version: t.version });
  }
  return out;
}

// ---------- Quotes ----------
export async function createQuote(userId: string, input: QuoteInput) {
  const cfg = await loadPricing();
  const routing = routingFor(cfg);
  await assertServiceable(input.pickup);
  await assertServiceable(input.dropoff);
  await assertCategory(input.category);
  const maxSeats = input.vehicleType === "suv" ? 6 : 4;
  if (input.passengerCount > maxSeats) throw new AppError("CAPACITY_EXCEEDED", `A ${input.vehicleType} seats at most ${maxSeats}.`);
  if (SHARED_MODES.includes(input.mode) && input.passengerCount > 2) throw new AppError("CAPACITY_EXCEEDED", "Shared rides allow at most 2 seats per booking. Use Group Private.");
  if (haversineM(input.pickup, input.dropoff) < 500) throw new AppError("TOO_SHORT", "Pickup and drop-off are too close.");
  const metrics = routing.leg(input.pickup, input.dropoff);
  const ref = privateFare(cfg, metrics, input.vehicleType);
  const amounts = quoteAmounts(cfg, input.mode, ref, input.budgetPaise);
  let sharedTripId: string | null = null;
  let sharedOption: MatchOption | null = null;
  let rejections: { tripId: string; reasons: string[] }[] = [];
  if (input.mode === "SHARED_NOW") {
    const cands = await sharedCandidates();
    const start = input.departAt ? new Date(input.departAt).getTime() : Date.now();
    const req = { bookingId: "NEW", count: input.passengerCount, pickup: input.pickup, dropoff: input.dropoff, maxDetourPct: input.maxDetourPct, soloDistanceM: metrics.distanceM, soloFare: ref.total, cap: amounts.currentGuaranteedPayable, category: input.category ?? null, windowStart: start, windowEnd: start + 30 * 60000 };
    const res = findMatches(req, cands.map((c) => c.cand), cfg, routing);
    rejections = res.rejections;
    if (!res.options.length) {
      return { ok: false as const, reason: "NO_FEASIBLE_SHARED_RIDE", rejections, fallbackPrivateFare: privateFare(cfg, metrics, input.vehicleType).total };
    }
    sharedOption = res.options[0];
    sharedTripId = sharedOption.tripId;
    const mine = sharedOption.economics.allocations.find((a) => a.bookingId === "NEW")!;
    amounts.currentGuaranteedPayable = mine.amount;
    amounts.guaranteedDiscount = ref.total - mine.amount;
    amounts.potentialAdditionalDiscount = 0;
  }
  const row = {
    passenger_id: userId,
    ride_mode: input.mode,
    pickup_label: input.pickup.label, pickup_lat: input.pickup.lat, pickup_lng: input.pickup.lng,
    dropoff_label: input.dropoff.label, dropoff_lat: input.dropoff.lat, dropoff_lng: input.dropoff.lng,
    passenger_count: input.passengerCount,
    vehicle_type: input.vehicleType,
    distance_m: metrics.distanceM,
    duration_s: metrics.durationS,
    private_reference_fare: amounts.privateReferenceFare,
    initial_fare_ceiling: amounts.initialFareCeiling,
    guaranteed_discount: amounts.guaranteedDiscount,
    current_guaranteed_payable: amounts.currentGuaranteedPayable,
    potential_additional_discount: amounts.potentialAdditionalDiscount,
    budget_paise: input.budgetPaise ?? null,
    shared_trip_id: sharedTripId,
    pricing_version: cfg.version,
    routing_provider: routing.name,
    calculation: {
      breakdown: ref, amounts, input: { ...input }, sharedOption: sharedOption && { tripId: sharedOption.tripId, detours: sharedOption.detours, economics: sharedOption.economics },
      cancellation: { fee_paise: cfg.cancellation_fee_paise, noshow_grace_s: cfg.noshow_grace_s },
    },
    expires_at: new Date(Date.now() + cfg.quote_ttl_s * 1000).toISOString(),
  };
  const { data, error } = await db().from("quotes").insert(row).select("*").single();
  if (error) throw new AppError("DB_ERROR", error.message);
  return { ok: true as const, quote: data, simulatedRouting: routing.simulated };
}

// ---------- Booking confirmation ----------
export async function confirmBooking(userId: string, input: { quoteId: string; idempotencyKey: string; paymentMethod: "cash" | "digital"; departAt?: string; maxDetourPct: number; language?: string; accessibility?: Record<string, unknown> }) {
  // Idempotent: same key → same booking (safe to retry after network interruption).
  const { data: existing } = await db().from("bookings").select("*").eq("passenger_id", userId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existing) return { booking: existing, idempotentReplay: true };
  const { data: q } = await db().from("quotes").select("*").eq("id", input.quoteId).single();
  if (!q || q.passenger_id !== userId) throw new AppError("NOT_FOUND", "Quote not found");
  if (new Date(q.expires_at) < new Date()) throw new AppError("QUOTE_EXPIRED", "This quote has expired. Please get a fresh quote.");
  const start = input.departAt ? new Date(input.departAt) : new Date();
  const ins = {
    passenger_id: userId, quote_id: q.id, ride_mode: q.ride_mode, passenger_count: q.passenger_count, vehicle_type: q.vehicle_type,
    pickup_label: q.pickup_label, pickup_lat: q.pickup_lat, pickup_lng: q.pickup_lng,
    dropoff_label: q.dropoff_label, dropoff_lat: q.dropoff_lat, dropoff_lng: q.dropoff_lng,
    solo_distance_m: q.distance_m,
    window_start: start.toISOString(), window_end: new Date(start.getTime() + 30 * 60000).toISOString(),
    max_detour_pct: input.maxDetourPct,
    category_preference: q.calculation?.input?.category ?? null,
    language_preference: input.language ?? null,
    accessibility: input.accessibility ?? {},
    state: "QUOTED",
    private_reference_fare: q.private_reference_fare,
    confirmed_fare_ceiling: q.initial_fare_ceiling,
    current_guaranteed_payable: q.current_guaranteed_payable,
    payment_method: input.paymentMethod,
    idempotency_key: input.idempotencyKey,
  };
  const { data: b, error } = await db().from("bookings").insert(ins).select("*").single();
  if (error) {
    if (error.code === "23505") {
      const { data: again } = await db().from("bookings").select("*").eq("passenger_id", userId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
      if (again) return { booking: again, idempotentReplay: true };
      throw new AppError("QUOTE_ALREADY_USED", "This quote was already used for a booking.");
    }
    throw new AppError("DB_ERROR", error.message);
  }
  await db().from("fare_allocations").insert({ booking_id: b.id, quoted_amount: q.initial_fare_ceiling, guaranteed_amount: q.current_guaranteed_payable, allocation_method: "quote", pricing_version: q.pricing_version, snapshot: q.calculation });
  await db().from("booking_events").insert({ booking_id: b.id, from_state: null, to_state: "QUOTED", actor_id: userId, actor_role: "passenger", reason: "booking created from quote" });
  await transitionBooking({ bookingId: b.id, to: "SEARCHING", actor: "passenger", actorId: userId, reason: "passenger confirmed" });
  const result = await findAndPropose(b.id, { onlyTripId: q.ride_mode === "SHARED_NOW" ? q.shared_trip_id : null });
  if (q.ride_mode === "SHARED_NOW" && result.status !== "proposed") {
    await transitionBooking({ bookingId: b.id, to: "EXPIRED", actor: "system", actorId: null, reason: "SHARED_NOW option no longer feasible: " + JSON.stringify(result.rejections) });
  }
  const { data: fresh } = await db().from("bookings").select("*").eq("id", b.id).single();
  return { booking: fresh, idempotentReplay: false, matching: result };
}

// ---------- Matching / assignment ----------
export async function findAndPropose(bookingId: string, opts: { onlyTripId?: string | null; excludeDrivers?: string[] } = {}) {
  const cfg = await loadPricing();
  const routing = routingFor(cfg);
  const { data: b } = await db().from("bookings").select("*").eq("id", bookingId).single();
  if (!b || b.state !== "SEARCHING") return { status: "skipped" as const, rejections: [] };
  const { data: rejectedEv } = await db().from("trip_events").select("payload").eq("booking_id", b.id).eq("event_type", "match_rejected");
  const exclude = new Set([...(opts.excludeDrivers ?? []), ...(rejectedEv ?? []).map((e: { payload: { driverId: string } }) => e.payload.driverId)]);
  const mode = b.ride_mode as RideMode;
  const budgetNeedsMatch = mode === "BUDGET" && Number(b.confirmed_fare_ceiling) < Number(b.private_reference_fare);
  let rejections: { tripId: string; reasons: string[] }[] = [];

  if (SHARED_MODES.includes(mode)) {
    const cands = (await sharedCandidates(opts.onlyTripId)).filter((c) => !exclude.has(c.cand.driverId));
    const res = findMatches(requestFromBooking(b), cands.map((c) => c.cand), cfg, routing);
    rejections = res.rejections;
    for (const opt of res.options) {
      const ver = cands.find((c) => c.cand.tripId === opt.tripId)!.version;
      if (await proposeOnExisting(b, opt, ver, cfg)) return { status: "proposed" as const, tripId: opt.tripId, rejections };
    }
    if (opts.onlyTripId || budgetNeedsMatch) {
      await db().from("trip_events").insert({ booking_id: b.id, event_type: "no_feasible_match", payload: { rejections } });
      return { status: "none" as const, rejections };
    }
  }
  const t = await proposeNewTrip(b, cfg, exclude);
  if (t) return { status: "proposed" as const, tripId: t, rejections };
  await db().from("trip_events").insert({ booking_id: b.id, event_type: "no_driver_available", payload: { rejections } });
  return { status: "none" as const, rejections };
}

function stopsPayload(stops: Stop[], labels: Map<string, { pickup: string; dropoff: string }>) {
  return stops.map((s) => ({ bookingId: s.bookingId, type: s.type, lat: s.point.lat, lng: s.point.lng, label: labels.get(s.bookingId)?.[s.type] ?? s.type }));
}

async function labelMap(bookingIds: string[]) {
  const { data } = await db().from("bookings").select("id,pickup_label,dropoff_label").in("id", bookingIds);
  return new Map<string, { pickup: string; dropoff: string }>((data ?? []).map((x: { id: string; pickup_label: string; dropoff_label: string }) => [x.id, { pickup: x.pickup_label, dropoff: x.dropoff_label }]));
}

async function proposeOnExisting(b: Booking, opt: MatchOption, version: number, cfg: PricingConfig): Promise<boolean> {
  // Optimistic lock on the trip: only one proposal per trip version wins.
  const { data: locked } = await db().from("trips").update({ version: version + 1 }).eq("id", opt.tripId).eq("version", version).select("id").maybeSingle();
  if (!locked) return false;
  const pIdx = opt.stops.findIndex((s) => s.bookingId === b.id && s.type === "pickup");
  const dIdx = opt.stops.findIndex((s) => s.bookingId === b.id && s.type === "dropoff");
  const { error } = await db().from("trip_bookings").insert({ trip_id: opt.tripId, booking_id: b.id, pickup_seq: pIdx + 1, dropoff_seq: dIdx + 1, assignment_state: "proposed", proposal_expires_at: new Date(Date.now() + PROPOSAL_TTL_S * 1000).toISOString() });
  if (error) return false; // unique index: booking already has a live assignment
  const labels = await labelMap([...new Set(opt.stops.map((s) => s.bookingId))]);
  await db().from("trip_events").insert({ trip_id: opt.tripId, booking_id: b.id, event_type: "match_proposed", payload: { tripVersionAfter: version + 1, stops: stopsPayload(opt.stops, labels), economics: opt.economics, detours: opt.detours, addedDistanceM: opt.addedDistanceM, totalDistanceM: opt.totalDistanceM, totalDurationS: opt.totalDurationS, pricingVersion: cfg.version } });
  await transitionBooking({ bookingId: b.id, to: "MATCH_PROPOSED", actor: "system", actorId: null, reason: `shared match proposed on trip ${opt.tripId}` });
  return true;
}

async function proposeNewTrip(b: Booking, cfg: PricingConfig, exclude: Set<string>): Promise<string | null> {
  const isShared = SHARED_MODES.includes(b.ride_mode);
  const { data: drivers } = await db().from("driver_profiles").select("*").eq("availability_status", "online").eq("verification_status", "verified");
  const pickup = { lat: b.pickup_lat, lng: b.pickup_lng };
  const ranked = (drivers ?? [])
    .filter((d: { id: string; restricted_until: string | null; current_lat: number | null }) => !exclude.has(d.id) && d.current_lat != null && !(d.restricted_until && new Date(d.restricted_until) > new Date()))
    .map((d: { current_lat: number; current_lng: number }) => ({ d, dist: haversineM({ lat: d.current_lat, lng: d.current_lng }, pickup) }))
    .filter((x: { dist: number }) => x.dist <= cfg.max_pickup_radius_m * 3)
    .sort((a: { dist: number }, z: { dist: number }) => a.dist - z.dist);
  const routing = routingFor(cfg);
  for (const { d } of ranked) {
    const { data: veh } = await db().from("vehicles").select("*").eq("driver_id", d.id).eq("is_active", true).eq("verification_status", "verified").maybeSingle();
    if (!veh || veh.seating_capacity < b.passenger_count) continue;
    if (!isShared && b.ride_mode === "GROUP_PRIVATE" && veh.seating_capacity < b.passenger_count) continue;
    const metrics = routing.leg(pickup, { lat: b.dropoff_lat, lng: b.dropoff_lng });
    const { data: trip, error } = await db().from("trips").insert({ driver_id: d.id, vehicle_id: veh.id, is_shared: isShared, category: b.category_preference, state: "planned", planned_start: b.window_start, planned_distance_m: metrics.distanceM, planned_duration_s: metrics.durationS, version: 1 }).select("*").single();
    if (error) continue; // driver already has an active trip (unique index) → next driver
    const { error: tbErr } = await db().from("trip_bookings").insert({ trip_id: trip.id, booking_id: b.id, pickup_seq: 1, dropoff_seq: 2, assignment_state: "proposed", proposal_expires_at: new Date(Date.now() + PROPOSAL_TTL_S * 1000).toISOString() });
    if (tbErr) {
      await db().from("trips").update({ state: "cancelled" }).eq("id", trip.id);
      return null;
    }
    const stops = [
      { bookingId: b.id, type: "pickup", lat: b.pickup_lat, lng: b.pickup_lng, label: b.pickup_label },
      { bookingId: b.id, type: "dropoff", lat: b.dropoff_lat, lng: b.dropoff_lng, label: b.dropoff_label },
    ];
    const cap = Number(b.current_guaranteed_payable);
    await db().from("trip_events").insert({ trip_id: trip.id, booking_id: b.id, event_type: "match_proposed", payload: { tripVersionAfter: 1, stops, economics: { allocations: [{ bookingId: b.id, amount: cap }], method: isShared ? "solo-share-guarantee" : "private", driverGrossPayout: driverGrossPayout(cfg, cap), benchmarkDriverPayout: driverGrossPayout(cfg, Number(b.private_reference_fare)) }, totalDistanceM: metrics.distanceM, totalDurationS: metrics.durationS, pricingVersion: cfg.version } });
    await transitionBooking({ bookingId: b.id, to: "MATCH_PROPOSED", actor: "system", actorId: null, reason: `offered to driver ${d.id}` });
    return trip.id;
  }
  return null;
}

async function driverByUser(userId: string) {
  const { data } = await db().from("driver_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (!data) throw new AppError("NOT_A_DRIVER", "No driver profile for this account");
  return data;
}

async function assignmentFor(bookingId: string, states = ["proposed", "confirmed"]) {
  const { data } = await db().from("trip_bookings").select("*, trips(*)").eq("booking_id", bookingId).in("assignment_state", states).maybeSingle();
  return data;
}

/** Resolve acting driver: real driver account, or (demo mode only) system acting for a seeded DEMO driver. */
export async function resolveDriverActor(userId: string, bookingId: string, demoAct: boolean): Promise<{ driverId: string; actor: ActorRole; tb: Booking }> {
  const tb = await assignmentFor(bookingId);
  if (!tb) throw new AppError("NOT_ASSIGNED", "Booking has no live driver assignment");
  if (demoAct) {
    const { data: drv } = await db().from("driver_profiles").select("is_demo").eq("id", tb.trips.driver_id).single();
    if (!drv?.is_demo) throw new AppError("FORBIDDEN", "Demo simulation is only allowed for seeded DEMO drivers");
    return { driverId: tb.trips.driver_id, actor: "system", tb };
  }
  const d = await driverByUser(userId);
  if (tb.trips.driver_id !== d.id) throw new AppError("FORBIDDEN", "You are not the assigned driver");
  return { driverId: d.id, actor: "driver", tb };
}

export async function acceptProposal(actorUserId: string, bookingId: string, demoAct = false) {
  const { driverId, actor, tb } = await resolveDriverActor(actorUserId, bookingId, demoAct);
  if (tb.assignment_state !== "proposed") throw new AppError("STATE_CONFLICT", "Not a pending proposal");
  if (tb.proposal_expires_at && new Date(tb.proposal_expires_at) < new Date()) {
    await rejectProposal(actorUserId, bookingId, demoAct, "PROPOSAL_EXPIRED");
    throw new AppError("PROPOSAL_EXPIRED", "Offer expired; passenger re-entered search.");
  }
  const { data: ev } = await db().from("trip_events").select("payload").eq("booking_id", bookingId).eq("trip_id", tb.trip_id).eq("event_type", "match_proposed").order("created_at", { ascending: false }).limit(1).single();
  const p = ev.payload;
  const { data: trip } = await db().from("trips").select("*").eq("id", tb.trip_id).single();
  if (trip.version !== p.tripVersionAfter) {
    await rejectProposal(actorUserId, bookingId, demoAct, "TRIP_CHANGED_REVALIDATION_FAILED");
    throw new AppError("REVALIDATION_FAILED", "Trip changed since the proposal; passenger re-matched.");
  }
  // Apply stops atomically-ish: replace all pending stops with the proposal sequence.
  await db().from("trip_stops").delete().eq("trip_id", trip.id).eq("status", "pending");
  const { data: doneStops } = await db().from("trip_stops").select("seq").eq("trip_id", trip.id).order("seq", { ascending: false }).limit(1);
  const offset = doneStops?.[0]?.seq ?? 0;
  await db().from("trip_stops").insert(p.stops.map((s: { bookingId: string; type: string; lat: number; lng: number; label: string }, i: number) => ({ trip_id: trip.id, seq: offset + i + 1, stop_type: s.type, booking_id: s.bookingId, label: s.label, lat: s.lat, lng: s.lng })));
  // Guarantees: monotonic non-increasing for every rider.
  for (const a of p.economics.allocations as { bookingId: string; amount: number }[]) {
    const { data: rb } = await db().from("bookings").select("id,current_guaranteed_payable,passenger_id,private_reference_fare").eq("id", a.bookingId).single();
    const next = nextGuaranteed(Number(rb.current_guaranteed_payable), a.amount);
    if (next < Number(rb.current_guaranteed_payable)) {
      await db().from("bookings").update({ current_guaranteed_payable: next }).eq("id", rb.id);
      await notify(rb.passenger_id, "Your fare went down", `A compatible co-passenger joined. Your guaranteed fare is now ₹${(next / 100).toFixed(2)} (was ₹${(Number(rb.current_guaranteed_payable) / 100).toFixed(2)}). It will not go back up.`);
    }
    await db().from("fare_allocations").insert({ booking_id: rb.id, trip_id: trip.id, quoted_amount: Number(rb.current_guaranteed_payable), guaranteed_amount: next, allocation_method: p.economics.method ?? ALLOCATION_METHOD, pricing_version: p.pricingVersion, snapshot: p });
  }
  await db().from("trip_bookings").update({ assignment_state: "confirmed" }).eq("id", tb.id);
  await db().from("trips").update({ version: trip.version + 1, planned_distance_m: p.totalDistanceM, planned_duration_s: p.totalDurationS }).eq("id", trip.id);
  await db().from("driver_profiles").update({ availability_status: "on_trip" }).eq("id", driverId);
  const nb = await transitionBooking({ bookingId, to: "MATCH_CONFIRMED", actor, actorId: actorUserId, reason: demoAct ? "DEMO driver acceptance (simulated)" : "driver accepted" });
  await db().from("trip_events").insert({ trip_id: trip.id, booking_id: bookingId, event_type: "match_accepted", actor_id: actorUserId, payload: { demo: demoAct } });
  await notify(nb.passenger_id, "Driver confirmed", "Your ride is confirmed. Track it from My trips.");
  return { ok: true };
}

export async function rejectProposal(actorUserId: string, bookingId: string, demoAct = false, reason = "DRIVER_REJECTED") {
  const { driverId, actor, tb } = await resolveDriverActor(actorUserId, bookingId, demoAct);
  if (tb.assignment_state !== "proposed") throw new AppError("STATE_CONFLICT", "Not a pending proposal");
  await db().from("trip_bookings").update({ assignment_state: "removed" }).eq("id", tb.id);
  await db().from("trip_events").insert({ trip_id: tb.trip_id, booking_id: bookingId, event_type: "match_rejected", actor_id: actorUserId, payload: { driverId, reason } });
  await maybeCloseTrip(tb.trip_id);
  await transitionBooking({ bookingId, to: "SEARCHING", actor: actor === "driver" ? "driver" : "system", actorId: actorUserId, reason });
  await findAndPropose(bookingId);
  return { ok: true };
}

async function maybeCloseTrip(tripId: string) {
  const { data: live } = await db().from("trip_bookings").select("id").eq("trip_id", tripId).in("assignment_state", ["proposed", "confirmed"]);
  if (live && live.length) return false;
  const { data: t } = await db().from("trips").select("driver_id,state").eq("id", tripId).single();
  const { data: done } = await db().from("trip_bookings").select("id").eq("trip_id", tripId).eq("assignment_state", "completed");
  await db().from("trips").update({ state: done && done.length ? "completed" : "cancelled", completed_at: new Date().toISOString() }).eq("id", tripId);
  await db().from("driver_profiles").update({ availability_status: "online" }).eq("id", t.driver_id).eq("availability_status", "on_trip");
  return true;
}

// ---------- Trip progression ----------
const DRIVER_STEPS: BookingState[] = ["DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_ONBOARD", "IN_PROGRESS", "COMPLETED"];

export async function advanceBooking(actorUserId: string, bookingId: string, to: BookingState, demoAct = false) {
  if (!DRIVER_STEPS.includes(to)) throw new AppError("INVALID_STEP");
  const { actor, tb, driverId } = await resolveDriverActor(actorUserId, bookingId, demoAct);
  if (tb.assignment_state !== "confirmed") throw new AppError("NOT_CONFIRMED", "Assignment not confirmed");
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (to === "DRIVER_ARRIVED") patch.arrived_at = now;
  if (to === "COMPLETED") {
    const { data: b } = await db().from("bookings").select("current_guaranteed_payable").eq("id", bookingId).single();
    patch.final_fare = Number(b.current_guaranteed_payable);
    // TODO(GPS adapter): verify driver position near drop-off once a trusted location provider is configured.
  }
  const nb = await transitionBooking({ bookingId, to, actor, actorId: actorUserId, reason: demoAct ? "DEMO driver step (simulated)" : "driver update", patch });
  const stopType = to === "DRIVER_ARRIVED" || to === "PASSENGER_ONBOARD" ? "pickup" : to === "COMPLETED" ? "dropoff" : null;
  if (stopType) await db().from("trip_stops").update({ status: to === "DRIVER_ARRIVED" ? "arrived" : "done", actual_arrival: now }).eq("trip_id", tb.trip_id).eq("booking_id", bookingId).eq("stop_type", stopType);
  if (to === "DRIVER_EN_ROUTE") await db().from("trips").update({ state: "driver_en_route" }).eq("id", tb.trip_id).eq("state", "planned");
  if (to === "IN_PROGRESS") await db().from("trips").update({ state: "in_progress", started_at: now }).eq("id", tb.trip_id).in("state", ["planned", "driver_en_route"]);
  await db().from("trip_events").insert({ trip_id: tb.trip_id, booking_id: bookingId, event_type: `booking_${to.toLowerCase()}`, actor_id: actorUserId, payload: { demo: demoAct } });
  if (to === "COMPLETED") await finalizeBooking(bookingId, tb.trip_id, driverId);
  const msgs: Partial<Record<BookingState, string>> = { DRIVER_EN_ROUTE: "Your driver is on the way.", DRIVER_ARRIVED: "Your driver has arrived at pickup.", COMPLETED: "Trip completed. Thank you for riding." };
  if (msgs[to]) await notify(nb.passenger_id, "Trip update", msgs[to]!);
  return { ok: true, state: to };
}

async function finalizeBooking(bookingId: string, tripId: string, driverId: string) {
  const cfg = await loadPricing();
  const { data: b } = await db().from("bookings").select("*").eq("id", bookingId).single();
  const fare = Number(b.final_fare);
  await db().from("fare_ledger").insert({ booking_id: b.id, entry_type: "fare_charged", amount_paise: fare, reason: "trip completed at guaranteed fare (≤ ceiling)" });
  await db().from("fare_allocations").insert({ booking_id: b.id, trip_id: tripId, quoted_amount: Number(b.confirmed_fare_ceiling), guaranteed_amount: Number(b.current_guaranteed_payable), final_amount: fare, allocation_method: "final", pricing_version: cfg.version, snapshot: { final: fare } });
  const digital = b.payment_method === "digital";
  await db().from("payment_records").insert({ booking_id: b.id, provider: digital ? "sandbox" : "cash", provider_reference: digital ? `sbx_${newToken(8)}` : null, method: b.payment_method, amount_paise: fare, status: digital ? "pending" : "due", idempotency_key: `pay-${b.id}` });
  await db().from("driver_payout_ledger").insert({ trip_id: tripId, booking_id: b.id, driver_id: driverId, entry_type: "trip_payout", amount_paise: driverGrossPayout(cfg, fare), reason: `gross payout = fare − ${cfg.platform_commission_bps / 100}% commission` });
  await db().from("trip_bookings").update({ assignment_state: "completed" }).eq("trip_id", tripId).eq("booking_id", bookingId).eq("assignment_state", "confirmed");
  const closed = await maybeCloseTrip(tripId);
  if (closed) await settleTripPayoutFloor(tripId, driverId, cfg);
}

/**
 * Driver protection at trip close: comparable private payout for the trip's
 * planned route (×1.05 if ≥2 passengers completed). Any shortfall (e.g. a
 * co-passenger cancelled after discounts were guaranteed) is paid from the
 * platform cancellation reserve — funding source is an OPEN DECISION.
 */
async function settleTripPayoutFloor(tripId: string, driverId: string, cfg: PricingConfig) {
  const { data: trip } = await db().from("trips").select("*, vehicles(vehicle_type)").eq("id", tripId).single();
  const { data: done } = await db().from("trip_bookings").select("booking_id").eq("trip_id", tripId).eq("assignment_state", "completed");
  if (!done?.length) return;
  const { data: bks } = await db().from("bookings").select("private_reference_fare,solo_distance_m").in("id", done.map((d: { booking_id: string }) => d.booking_id));
  const routeFare = done.length > 1
    ? privateFare(cfg, { distanceM: trip.planned_distance_m ?? 0, durationS: trip.planned_duration_s ?? 0 }, trip.vehicles?.vehicle_type ?? "hatchback").total
    : Number(bks[0].private_reference_fare);
  const benchmark = driverGrossPayout(cfg, routeFare);
  const target = trip.is_shared && done.length > 1 ? applyBps(benchmark, cfg.driver_shared_payout_multiplier_bps) : trip.is_shared ? benchmark : 0;
  const { data: paid } = await db().from("driver_payout_ledger").select("amount_paise").eq("trip_id", tripId).in("entry_type", ["trip_payout", "reserve_topup"]);
  const sum = (paid ?? []).reduce((a: number, r: { amount_paise: number }) => a + Number(r.amount_paise), 0);
  if (target > sum) {
    await db().from("driver_payout_ledger").insert({ trip_id: tripId, driver_id: driverId, entry_type: "reserve_topup", amount_paise: target - sum, reason: `payout floor: target ${target} vs paid ${sum} (benchmark ${benchmark})` });
  }
  await db().from("trip_events").insert({ trip_id: tripId, event_type: "payout_floor_settled", payload: { routeFare, benchmark, target, paidBefore: sum, riders: done.length } });
}

// ---------- Cancellation / no-show ----------
export async function cancelByPassenger(userId: string, bookingId: string, reason: string) {
  const cfg = await loadPricing();
  const { data: b } = await db().from("bookings").select("*").eq("id", bookingId).single();
  if (!b || b.passenger_id !== userId) throw new AppError("NOT_FOUND");
  const out = cancellationOutcome(cfg, b.state, "passenger", { arrivedAt: b.arrived_at });
  if (!out.allowed) throw new AppError(out.reason ?? "NOT_CANCELLABLE", out.note);
  const tb = await assignmentFor(bookingId);
  await transitionBooking({ bookingId, to: "CANCELLED", actor: "passenger", actorId: userId, reason: `passenger: ${reason}` });
  if (out.feePaise > 0) await db().from("fare_ledger").insert({ booking_id: bookingId, entry_type: "cancellation_fee", amount_paise: out.feePaise, reason: "disclosed cancellation fee" });
  if (tb) await detachFromTrip(tb, bookingId, "co_passenger_cancelled");
  return { ok: true, feePaise: out.feePaise, note: out.note };
}

async function detachFromTrip(tb: Booking, bookingId: string, eventType: string) {
  await db().from("trip_bookings").update({ assignment_state: "removed" }).eq("id", tb.id);
  await db().from("trip_stops").delete().eq("trip_id", tb.trip_id).eq("booking_id", bookingId).eq("status", "pending");
  await db().from("trips").update({ version: tb.trips.version + 1 }).eq("id", tb.trip_id);
  // Remaining passengers' guaranteed fares are untouched (never increase).
  await db().from("trip_events").insert({ trip_id: tb.trip_id, booking_id: bookingId, event_type: eventType, payload: { note: "remaining guaranteed fares unchanged; driver shortfall (if any) covered by reserve at trip close" } });
  await maybeCloseTrip(tb.trip_id);
}

export async function cancelByDriver(actorUserId: string, bookingId: string, reason: string, demoAct = false) {
  const cfg = await loadPricing();
  const { tb, actor, driverId } = await resolveDriverActor(actorUserId, bookingId, demoAct);
  const { data: b } = await db().from("bookings").select("state").eq("id", bookingId).single();
  const out = cancellationOutcome(cfg, b.state, "driver");
  if (!out.allowed) throw new AppError(out.reason ?? "NOT_CANCELLABLE", out.note);
  await detachFromTrip(tb, bookingId, "driver_cancelled");
  await db().from("trip_events").insert({ booking_id: bookingId, event_type: "match_rejected", payload: { driverId, reason: "DRIVER_CANCELLED" } });
  const nb = await transitionBooking({ bookingId, to: "SEARCHING", actor: actor === "driver" ? "driver" : "system", actorId: actorUserId, reason: `driver cancelled: ${reason}` });
  await notify(nb.passenger_id, "Driver cancelled", "We're finding you another driver. Your guaranteed fare is unchanged.");
  await findAndPropose(bookingId);
  return { ok: true };
}

export async function markNoShow(actorUserId: string, bookingId: string, demoAct = false) {
  const cfg = await loadPricing();
  const { tb, actor } = await resolveDriverActor(actorUserId, bookingId, demoAct);
  const { data: b } = await db().from("bookings").select("state,arrived_at").eq("id", bookingId).single();
  if (b.state !== "DRIVER_ARRIVED" || !canMarkNoShow(b.arrived_at, cfg)) throw new AppError("GRACE_NOT_ELAPSED", `No-show can be marked ${cfg.noshow_grace_s / 60} min after arrival.`);
  await transitionBooking({ bookingId, to: "CANCELLED", actor: actor === "driver" ? "driver" : "system", actorId: actorUserId, reason: "NO_SHOW after grace period" });
  if (cfg.cancellation_fee_paise > 0) await db().from("fare_ledger").insert({ booking_id: bookingId, entry_type: "cancellation_fee", amount_paise: cfg.cancellation_fee_paise, reason: "no-show fee (disclosed)" });
  await detachFromTrip(tb, bookingId, "passenger_no_show");
  return { ok: true };
}

export async function collectCash(actorUserId: string, bookingId: string, demoAct = false) {
  const tb = await assignmentFor(bookingId, ["completed"]);
  if (!tb) throw new AppError("NOT_COMPLETED");
  if (demoAct) {
    const { data: drv } = await db().from("driver_profiles").select("is_demo").eq("id", tb.trips.driver_id).single();
    if (!drv?.is_demo) throw new AppError("FORBIDDEN");
  } else {
    const d = await driverByUser(actorUserId);
    if (d.id !== tb.trips.driver_id) throw new AppError("FORBIDDEN");
  }
  const { data: pay } = await db().from("payment_records").select("*").eq("booking_id", bookingId).eq("method", "cash").maybeSingle();
  if (!pay) throw new AppError("NO_CASH_PAYMENT");
  if (pay.status === "collected") return { ok: true, replay: true };
  const { data: upd } = await db().from("payment_records").update({ status: "collected", updated_at: new Date().toISOString() }).eq("id", pay.id).eq("status", "due").select("id").maybeSingle();
  if (!upd) return { ok: true, replay: true };
  await db().from("fare_ledger").insert({ booking_id: bookingId, entry_type: "cash_collected", amount_paise: Number(pay.amount_paise), reason: "cash collected by driver", created_by: actorUserId });
  await db().from("driver_payout_ledger").insert({ trip_id: tb.trip_id, booking_id: bookingId, driver_id: tb.trips.driver_id, entry_type: "cash_held", amount_paise: -Number(pay.amount_paise), reason: "driver holds cash; netted at settlement" });
  return { ok: true };
}

// ---------- Read models ----------
export async function bookingDetailFor(userId: string, bookingId: string, staff: boolean) {
  const { data: b } = await db().from("bookings").select("*").eq("id", bookingId).single();
  if (!b || (!staff && b.passenger_id !== userId)) throw new AppError("NOT_FOUND");
  const [{ data: events }, { data: allocs }, { data: pays }, { data: refunds }, { data: offers }, { data: q }] = await Promise.all([
    db().from("booking_events").select("*").eq("booking_id", bookingId).order("created_at"),
    db().from("fare_allocations").select("*").eq("booking_id", bookingId).order("created_at"),
    db().from("payment_records").select("*").eq("booking_id", bookingId),
    db().from("refunds").select("*").eq("booking_id", bookingId),
    db().from("negotiation_offers").select("*").eq("booking_id", bookingId).order("created_at"),
    db().from("quotes").select("calculation,guaranteed_discount,potential_additional_discount,pricing_version,routing_provider").eq("id", b.quote_id).single(),
  ]);
  const tb = await assignmentFor(bookingId, ["proposed", "confirmed", "completed"]);
  let driver: null | { name: string; vehicle: string; registration: string; rating: number | null; isDemo: boolean } = null;
  let coPassengers = 0;
  let myStops: unknown[] = [];
  if (tb) {
    const { data: d } = await db().from("driver_profiles").select("display_name,rating_avg,is_demo").eq("id", tb.trips.driver_id).single();
    const { data: v } = await db().from("vehicles").select("vehicle_type,registration_ref").eq("id", tb.trips.vehicle_id).single();
    driver = { name: d.display_name, vehicle: v.vehicle_type, registration: v.registration_ref, rating: d.rating_avg, isDemo: d.is_demo };
    const { data: others } = await db().from("trip_bookings").select("id").eq("trip_id", tb.trip_id).neq("booking_id", bookingId).in("assignment_state", ["confirmed", "completed"]);
    coPassengers = others?.length ?? 0;
    const { data: st } = await db().from("trip_stops").select("seq,stop_type,label,status,booking_id").eq("trip_id", tb.trip_id).order("seq");
    // Privacy: co-passenger stops are shown only as anonymous "shared stop".
    myStops = (st ?? []).map((s: { seq: number; stop_type: string; label: string; status: string; booking_id: string }) => ({ seq: s.seq, type: s.stop_type, status: s.status, mine: s.booking_id === bookingId, label: s.booking_id === bookingId ? s.label : "Shared stop" }));
  }
  return { booking: b, events, allocations: allocs, payments: pays, refunds, offers, quote: q, driver, coPassengers, stops: myStops, assignment: tb ? { state: tb.assignment_state, tripId: tb.trip_id, expiresAt: tb.proposal_expires_at } : null };
}
