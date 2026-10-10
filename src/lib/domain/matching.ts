/**
 * Deterministic greedy feasible-insertion matcher (no ML).
 * Hard constraints are filters; only feasible options are scored.
 * Every rejection carries explainable reason codes.
 */
import { haversineM, routeMetrics, type LatLng, type RoutingProvider } from "./geo";
import { allocateShared, type PricingConfig, type ReasonCode, type SharedEconomics, type VehicleType } from "./pricing";

export interface RiderSpec {
  bookingId: string;
  count: number;
  pickup: LatLng;
  dropoff: LatLng;
  maxDetourPct: number;
  soloDistanceM: number;
  soloFare: number;
  cap: number; // current guaranteed payable (paise)
  onboard?: boolean;
}

export interface Stop {
  bookingId: string;
  type: "pickup" | "dropoff";
  point: LatLng;
}

export interface TripCandidate {
  tripId: string;
  driverId: string;
  vehicleType: VehicleType;
  capacity: number;
  joinable: boolean; // shared, verified driver, not completing, etc.
  driverEligible: boolean;
  category: string | null;
  departAt: number; // epoch ms planned start
  driverLocation: LatLng;
  riders: RiderSpec[];
  stops: Stop[]; // remaining stops in order
}

export interface MatchRequest extends RiderSpec {
  category: string | null;
  windowStart: number;
  windowEnd: number;
}

export interface MatchOption {
  tripId: string;
  driverId: string;
  stops: Stop[];
  economics: SharedEconomics;
  detours: { bookingId: string; detourPct: number; rideDistanceM: number }[];
  addedDistanceM: number;
  totalDistanceM: number;
  totalDurationS: number;
  score: number;
}

export interface MatchResult {
  options: MatchOption[];
  rejections: { tripId: string; reasons: ReasonCode[] }[];
}

function evaluateSequence(
  trip: TripCandidate,
  riders: RiderSpec[],
  stops: Stop[],
  routing: RoutingProvider,
): { ok: boolean; reasons: ReasonCode[]; detours: MatchOption["detours"]; econStart: number } {
  const reasons = new Set<ReasonCode>();
  const pts: LatLng[] = [trip.driverLocation, ...stops.map((s) => s.point)];
  // cumulative distance at each point index
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + routing.leg(pts[i - 1]!, pts[i]!).distanceM);
  let load = riders.filter((r) => r.onboard).reduce((a, r) => a + r.count, 0);
  const pickedAt = new Map<string, number>();
  for (const r of riders) if (r.onboard) pickedAt.set(r.bookingId, 0);
  const detours: MatchOption["detours"] = [];
  stops.forEach((s, k) => {
    const idx = k + 1;
    const r = riders.find((x) => x.bookingId === s.bookingId)!;
    if (s.type === "pickup") {
      load += r.count;
      if (load > trip.capacity) reasons.add("CAPACITY_EXCEEDED");
      pickedAt.set(s.bookingId, idx);
    } else {
      const p = pickedAt.get(s.bookingId);
      if (p === undefined) {
        reasons.add("PICKUP_ORDER_INVALID");
        return;
      }
      load -= r.count;
      const ride = cum[idx]! - cum[p]!;
      const detourPct = r.soloDistanceM > 0 ? ((ride - r.soloDistanceM) * 100) / r.soloDistanceM : 0;
      detours.push({ bookingId: r.bookingId, detourPct: Math.round(detourPct * 10) / 10, rideDistanceM: ride });
      if (detourPct > r.maxDetourPct) reasons.add("DETOUR_LIMIT_EXCEEDED");
    }
  });
  const anyOnboard = riders.some((r) => r.onboard);
  const firstPickup = stops.findIndex((s) => s.type === "pickup");
  const econStart = anyOnboard ? 0 : Math.max(0, firstPickup + 1);
  return { ok: reasons.size === 0, reasons: [...reasons], detours, econStart };
}

export function findMatches(
  req: MatchRequest,
  candidates: TripCandidate[],
  cfg: PricingConfig,
  routing: RoutingProvider,
): MatchResult {
  const options: MatchOption[] = [];
  const rejections: MatchResult["rejections"] = [];
  for (const trip of candidates) {
    const pre: ReasonCode[] = [];
    if (!trip.joinable) pre.push("TRIP_NOT_JOINABLE");
    if (!trip.driverEligible) pre.push("DRIVER_INELIGIBLE");
    if ((trip.category ?? null) !== (req.category ?? null)) pre.push("CATEGORY_MISMATCH");
    const seatsUsedMax = trip.riders.reduce((a, r) => a + r.count, 0);
    if (req.count > trip.capacity || (seatsUsedMax + req.count > trip.capacity && trip.stops.length === 0)) pre.push("CAPACITY_EXCEEDED");
    if (trip.departAt < req.windowStart - 15 * 60000 || trip.departAt > req.windowEnd) pre.push("TIME_WINDOW_MISMATCH");
    const routePts = [trip.driverLocation, ...trip.stops.map((s) => s.point)];
    const nearest = Math.min(...routePts.map((p) => haversineM(p, req.pickup)));
    if (nearest > cfg.max_pickup_radius_m) pre.push("PICKUP_TOO_FAR");
    if (pre.length) {
      rejections.push({ tripId: trip.tripId, reasons: pre });
      continue;
    }
    const riders = [...trip.riders, req];
    const baseLen = routeMetrics(routePts, routing).distanceM;
    let best: MatchOption | null = null;
    const seen = new Set<ReasonCode>();
    const L = trip.stops.length;
    for (let i = 0; i <= L; i++) {
      for (let j = i; j <= L; j++) {
        const seq = [...trip.stops];
        seq.splice(i, 0, { bookingId: req.bookingId, type: "pickup", point: req.pickup });
        seq.splice(j + 1, 0, { bookingId: req.bookingId, type: "dropoff", point: req.dropoff });
        const ev = evaluateSequence(trip, riders, seq, routing);
        if (!ev.ok) {
          ev.reasons.forEach((r) => seen.add(r));
          continue;
        }
        const allPts = [trip.driverLocation, ...seq.map((s) => s.point)];
        const full = routeMetrics(allPts, routing);
        const econMetrics = routeMetrics(allPts.slice(ev.econStart), routing);
        const econ = allocateShared(
          cfg,
          econMetrics,
          trip.vehicleType,
          riders.map((r) => ({ bookingId: r.bookingId, soloFare: r.soloFare, cap: r.cap })),
        );
        if (!econ.feasible) {
          econ.reasons.forEach((r) => seen.add(r));
          continue;
        }
        const added = full.distanceM - baseLen;
        const totalDetour = ev.detours.reduce((a, d) => a + Math.max(0, d.detourPct), 0);
        // lower is better; hard constraints already satisfied
        const score = added / 100 + totalDetour * 10 - econ.driverEstimatedNet / 1000;
        if (!best || score < best.score) {
          best = { tripId: trip.tripId, driverId: trip.driverId, stops: seq, economics: econ, detours: ev.detours, addedDistanceM: added, totalDistanceM: full.distanceM, totalDurationS: full.durationS, score };
        }
      }
    }
    if (best) options.push(best);
    else rejections.push({ tripId: trip.tripId, reasons: seen.size ? [...seen] : ["PICKUP_ORDER_INVALID"] });
  }
  options.sort((a, b) => a.score - b.score || a.tripId.localeCompare(b.tripId));
  return { options, rejections };
}

/**
 * Atomic assignment guard (pure model of the DB invariant): a booking may hold
 * at most one active assignment and a trip's version must match the version
 * the option was computed against. The database enforces the same with a
 * unique partial index + optimistic version check.
 */
export interface AssignmentStore {
  activeAssignment: Map<string, string>; // bookingId -> tripId
  tripVersion: Map<string, number>;
}

export function tryAssign(store: AssignmentStore, bookingId: string, tripId: string, expectedVersion: number): boolean {
  if (store.activeAssignment.has(bookingId)) return false;
  if ((store.tripVersion.get(tripId) ?? 0) !== expectedVersion) return false;
  store.activeAssignment.set(bookingId, tripId);
  store.tripVersion.set(tripId, expectedVersion + 1);
  return true;
}
