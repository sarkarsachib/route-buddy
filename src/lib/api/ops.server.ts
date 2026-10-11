/** Operations / safety / finance / admin services. Every privileged write is audited. */
import { AppError, audit, db, getRoles, isDemoMode, loadPricing, newToken, notify, requireRole, type AppRole } from "./core.server";
import { parseWebhook, processWebhook, signPayload, verifySignature, type WebhookStore } from "@/lib/domain/payments";
import { DEFAULT_PRICING } from "@/lib/domain/pricing";

export async function me(userId: string) {
  const [{ data: profile }, roles, { data: driver }, demo] = await Promise.all([
    db().from("profiles").select("*").eq("id", userId).maybeSingle(),
    getRoles(userId),
    db().from("driver_profiles").select("*").eq("user_id", userId).maybeSingle(),
    isDemoMode(),
  ]);
  return { userId, profile, roles, driver, demoMode: demo };
}

const DEMO_ROLES: AppRole[] = ["driver", "ops_agent", "safety_reviewer", "finance", "admin"];

/** DEMO MODE ONLY: lets a tester self-grant roles. Audited. Must be disabled (app_config.demo_mode=false) before launch. */
export async function claimDemoRole(userId: string, role: AppRole) {
  if (!(await isDemoMode())) throw new AppError("FORBIDDEN", "Demo role claiming is disabled");
  if (!DEMO_ROLES.includes(role)) throw new AppError("INVALID_ROLE");
  await db().from("user_roles").upsert({ user_id: userId, role, granted_by: userId }, { onConflict: "user_id,role" });
  if (role === "driver") await ensureDemoDriverProfile(userId);
  await audit(userId, "demo_role_claimed", "user_roles", userId, { role });
  return { ok: true };
}

async function ensureDemoDriverProfile(userId: string) {
  const { data: existing } = await db().from("driver_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (existing) return;
  const { data: p } = await db().from("profiles").select("display_name").eq("id", userId).single();
  const { data: d } = await db().from("driver_profiles").insert({ user_id: userId, display_name: `${p?.display_name ?? "Driver"} (test driver)`, verification_status: "pending", availability_status: "offline", current_lat: 22.723, current_lng: 88.481, location_updated_at: new Date().toISOString() }).select("id").single();
  await db().from("vehicles").insert({ driver_id: d.id, vehicle_type: "hatchback", registration_ref: `TEST-${newToken(3).toUpperCase()}`, seating_capacity: 4, verification_status: "pending" });
  await db().from("verification_records").insert([
    { subject_type: "driver", subject_id: d.id, record_type: "driving_licence", status: "submitted", notes: "Test account — no document uploaded" },
    { subject_type: "driver", subject_id: d.id, record_type: "vehicle_rc", status: "submitted", notes: "Test account — no document uploaded" },
  ]);
}

export async function setDriverVerification(actor: string, driverId: string, status: "verified" | "rejected" | "in_review", notes: string) {
  await requireRole(actor, ["ops_agent", "admin"]);
  await db().from("driver_profiles").update({ verification_status: status }).eq("id", driverId);
  await db().from("vehicles").update({ verification_status: status }).eq("driver_id", driverId).eq("is_active", true);
  await db().from("verification_records").update({ status, reviewed_by: actor, verified_at: status === "verified" ? new Date().toISOString() : null, expires_at: status === "verified" ? new Date(Date.now() + 365 * 864e5).toISOString() : null }).eq("subject_type", "driver").eq("subject_id", driverId);
  await audit(actor, "driver_verification_set", "driver_profiles", driverId, { status, notes });
  const { data: d } = await db().from("driver_profiles").select("user_id").eq("id", driverId).single();
  await notify(d?.user_id, "Verification update", `Your driver verification status is now: ${status}.`);
  return { ok: true };
}

export async function overview(actor: string) {
  await requireRole(actor, ["ops_agent", "admin", "finance", "safety_reviewer"]);
  const [{ data: bookings }, { data: drivers }, { data: trips }, { data: incidents }, { data: ledger }, { data: payouts }, { data: refunds }, { data: support }] = await Promise.all([
    db().from("bookings").select("*").order("created_at", { ascending: false }).limit(200),
    db().from("driver_profiles").select("*, vehicles(*)").order("created_at"),
    db().from("trips").select("*").order("created_at", { ascending: false }).limit(100),
    db().from("safety_incidents").select("id,severity,status,created_at").limit(500),
    db().from("fare_ledger").select("*").order("created_at", { ascending: false }).limit(300),
    db().from("driver_payout_ledger").select("*").order("created_at", { ascending: false }).limit(300),
    db().from("refunds").select("*").order("created_at", { ascending: false }).limit(100),
    db().from("support_cases").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  const bs = bookings ?? [];
  const requested = bs.filter((b: { state: string }) => b.state !== "QUOTED" && b.state !== "DRAFT").length;
  const matched = bs.filter((b: { state: string }) => !["QUOTED", "DRAFT", "SEARCHING", "EXPIRED"].includes(b.state) && !(b.state === "CANCELLED")).length;
  const completed = bs.filter((b: { state: string }) => b.state === "COMPLETED");
  const cancelled = bs.filter((b: { state: string }) => b.state === "CANCELLED").length;
  const savings = completed.reduce((a: number, b: { private_reference_fare: number; final_fare: number }) => a + (Number(b.private_reference_fare) - Number(b.final_fare ?? 0)), 0);
  const fareSum = completed.reduce((a: number, b: { final_fare: number }) => a + Number(b.final_fare ?? 0), 0);
  const payoutSum = (payouts ?? []).filter((p: { entry_type: string }) => p.entry_type === "trip_payout" || p.entry_type === "reserve_topup").reduce((a: number, p: { amount_paise: number }) => a + Number(p.amount_paise), 0);
  const reserve = (payouts ?? []).filter((p: { entry_type: string }) => p.entry_type === "reserve_topup").reduce((a: number, p: { amount_paise: number }) => a + Number(p.amount_paise), 0);
  const completedTrips = (trips ?? []).filter((t: { state: string }) => t.state === "completed").length;
  return {
    metrics: {
      requestToMatchRate: requested ? matched / requested : null,
      completed: completed.length,
      cancellations: cancelled,
      passengerSavingsVsGenuinePrivatePaise: savings,
      grossFaresPaise: fareSum,
      driverGrossPayoutPaise: payoutSum,
      reserveFundedPaise: reserve,
      platformContributionPaise: fareSum - payoutSum,
      avgDriverPayoutPerTripPaise: completedTrips ? Math.round(payoutSum / completedTrips) : null,
      refundsPaise: (refunds ?? []).filter((r: { status: string }) => r.status === "processed_simulated").reduce((a: number, r: { amount_paise: number }) => a + Number(r.amount_paise), 0),
      openIncidents: (incidents ?? []).filter((i: { status: string }) => i.status !== "resolved").length,
      notYetMeasurable: ["median match time", "waiting time", "net earnings / online hour", "payment costs", "support cost"],
    },
    bookings: bs, drivers, trips, ledger, payouts, refunds, support,
  };
}

export async function reconciliation(actor: string) {
  await requireRole(actor, ["finance", "admin"]);
  const { data: entries } = await db().from("driver_payout_ledger").select("*").is("settlement_id", null);
  const { data: drivers } = await db().from("driver_profiles").select("id,display_name,is_demo");
  const by = new Map<string, { gross: number; cash: number; entries: number }>();
  for (const e of entries ?? []) {
    const r = by.get(e.driver_id) ?? { gross: 0, cash: 0, entries: 0 };
    if (e.entry_type === "cash_held") r.cash += -Number(e.amount_paise);
    else r.gross += Number(e.amount_paise);
    r.entries++;
    by.set(e.driver_id, r);
  }
  const { data: settlements } = await db().from("settlements").select("*").order("created_at", { ascending: false }).limit(50);
  return {
    rows: [...by.entries()].map(([driverId, r]) => ({ driverId, name: drivers?.find((d: { id: string }) => d.id === driverId)?.display_name, ...r, netDue: r.gross - r.cash })),
    settlements,
  };
}

export async function createSettlement(actor: string, driverId: string) {
  await requireRole(actor, ["finance", "admin"]);
  const { data: entries } = await db().from("driver_payout_ledger").select("*").eq("driver_id", driverId).is("settlement_id", null);
  if (!entries?.length) throw new AppError("NOTHING_TO_SETTLE");
  let gross = 0, cash = 0;
  for (const e of entries) e.entry_type === "cash_held" ? (cash += -Number(e.amount_paise)) : (gross += Number(e.amount_paise));
  const times = entries.map((e: { created_at: string }) => e.created_at).sort();
  const { data: s } = await db().from("settlements").insert({ driver_id: driverId, period_start: times[0], period_end: times[times.length - 1], gross_payout: gross, cash_collected: cash, net_due: gross - cash, status: "draft", created_by: actor }).select("*").single();
  await db().from("driver_payout_ledger").update({ settlement_id: s.id }).in("id", entries.map((e: { id: string }) => e.id));
  await audit(actor, "settlement_created", "settlements", s.id, { driverId, gross, cash, net: gross - cash, note: "payout transfer NOT executed — no payout provider configured" });
  return s;
}

// ----- Refunds -----
export async function requestRefund(userId: string, bookingId: string, amountPaise: number, reason: string) {
  const { data: b } = await db().from("bookings").select("passenger_id,final_fare").eq("id", bookingId).single();
  if (!b || b.passenger_id !== userId) throw new AppError("NOT_FOUND");
  if (!b.final_fare || amountPaise > Number(b.final_fare)) throw new AppError("INVALID_AMOUNT", "Refund cannot exceed the fare charged.");
  const { data: pay } = await db().from("payment_records").select("id").eq("booking_id", bookingId).maybeSingle();
  await db().from("refunds").insert({ booking_id: bookingId, payment_id: pay?.id ?? null, amount_paise: amountPaise, reason, requested_by: userId });
  return { ok: true };
}

export async function decideRefund(actor: string, refundId: string, approve: boolean) {
  await requireRole(actor, ["ops_agent", "finance", "admin"]);
  const { data: r } = await db().from("refunds").select("*").eq("id", refundId).single();
  if (r.status !== "requested") throw new AppError("ALREADY_DECIDED");
  const { data: prior } = await db().from("refunds").select("amount_paise").eq("booking_id", r.booking_id).eq("status", "processed_simulated");
  const { data: b } = await db().from("bookings").select("final_fare,passenger_id").eq("id", r.booking_id).single();
  const already = (prior ?? []).reduce((a: number, x: { amount_paise: number }) => a + Number(x.amount_paise), 0);
  if (approve && already + Number(r.amount_paise) > Number(b.final_fare)) throw new AppError("OVER_REFUND", "Total refunds would exceed the fare.");
  await db().from("refunds").update({ status: approve ? "processed_simulated" : "rejected", decided_by: actor, decided_at: new Date().toISOString() }).eq("id", refundId).eq("status", "requested");
  if (approve) await db().from("fare_ledger").insert({ booking_id: r.booking_id, entry_type: "refund", amount_paise: -Number(r.amount_paise), reason: `refund approved: ${r.reason} (SIMULATED — no money moved)`, created_by: actor });
  await audit(actor, approve ? "refund_approved" : "refund_rejected", "refunds", refundId, { amount: r.amount_paise });
  await notify(b.passenger_id, "Refund update", approve ? "Your refund was approved (demo: no real money moved)." : "Your refund request was declined. Contact support to appeal.");
  return { ok: true };
}

// ----- Safety -----
export async function reportIncident(userId: string, input: { bookingId?: string | null; category: string; description: string; role: "passenger" | "driver" }) {
  let tripId: string | null = null, driverId: string | null = null;
  if (input.bookingId) {
    const { data: b } = await db().from("bookings").select("passenger_id").eq("id", input.bookingId).single();
    const { data: tb } = await db().from("trip_bookings").select("trip_id, trips(driver_id)").eq("booking_id", input.bookingId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: myDriver } = await db().from("driver_profiles").select("id").eq("user_id", userId).maybeSingle();
    const isPassenger = b?.passenger_id === userId;
    const isDriver = myDriver && tb?.trips?.driver_id === myDriver.id;
    if (!isPassenger && !isDriver) throw new AppError("FORBIDDEN");
    tripId = tb?.trip_id ?? null;
    driverId = isPassenger ? tb?.trips?.driver_id ?? null : null;
  }
  // Triage hint from OBSERVABLE report category only — never inferred from appearance. Humans decide.
  const urgent = ["physical_safety", "harassment", "accident"].includes(input.category);
  const { data: inc } = await db().from("safety_incidents").insert({ booking_id: input.bookingId ?? null, trip_id: tripId, reporter_id: userId, reporter_role: input.role, subject_driver_id: driverId, category: input.category, description: input.description.slice(0, 4000), severity: urgent ? "high" : "unassessed" }).select("id").single();
  await db().from("incident_actions").insert({ incident_id: inc.id, actor_id: userId, action: "reported", notes: urgent ? "Auto-prioritised for human review based on reported category (not a determination)." : null });
  return { id: inc.id, urgent };
}

export async function incidents(actor: string) {
  await requireRole(actor, ["safety_reviewer", "admin"]);
  const { data } = await db().from("safety_incidents").select("*, incident_actions(*)").order("created_at", { ascending: false }).limit(100);
  await audit(actor, "incident_list_viewed", "safety_incidents", null, { count: data?.length ?? 0 });
  return data ?? [];
}

export async function actOnIncident(actor: string, id: string, action: "triage" | "escalate" | "review" | "interim_restrict" | "resolve" | "appeal", input: { severity?: string | undefined; notes: string; restrictHours?: number | undefined }) {
  await requireRole(actor, ["safety_reviewer", "admin"]);
  const { data: inc } = await db().from("safety_incidents").select("*").eq("id", id).single();
  const status = { triage: "triaged", escalate: "escalated", review: "under_review", interim_restrict: "interim_action", resolve: "resolved", appeal: "appealed" }[action];
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString(), assigned_to: actor };
  if (input.severity) patch["severity"] = input.severity;
  if (action === "interim_restrict") {
    if (!inc.subject_driver_id) throw new AppError("NO_SUBJECT", "No driver linked to this incident");
    const hours = Math.min(Math.max(input.restrictHours ?? 24, 1), 168); // proportionate & time-boxed
    await db().from("driver_profiles").update({ restricted_until: new Date(Date.now() + hours * 3600e3).toISOString(), restriction_reason: `Interim (incident ${id.slice(0, 8)}) — pending review`, availability_status: "offline" }).eq("id", inc.subject_driver_id);
  }
  await db().from("safety_incidents").update(patch).eq("id", id);
  await db().from("incident_actions").insert({ incident_id: id, actor_id: actor, action, notes: input.notes });
  await audit(actor, `incident_${action}`, "safety_incidents", id, { severity: input.severity, restrictHours: input.restrictHours });
  return { ok: true };
}

export async function openSupportCase(userId: string, bookingId: string | null, category: string, description: string) {
  if (bookingId) {
    const { data: b } = await db().from("bookings").select("passenger_id").eq("id", bookingId).single();
    if (b?.passenger_id !== userId) throw new AppError("FORBIDDEN");
  }
  await db().from("support_cases").insert({ booking_id: bookingId, opened_by: userId, category, description: description.slice(0, 4000) });
  return { ok: true };
}

export async function updateSupportCase(actor: string, id: string, status: "in_progress" | "resolved") {
  await requireRole(actor, ["ops_agent", "admin"]);
  await db().from("support_cases").update({ status, assigned_to: actor, updated_at: new Date().toISOString() }).eq("id", id);
  await audit(actor, "support_case_updated", "support_cases", id, { status });
  return { ok: true };
}

// ----- Admin config -----
export async function adminConfig(actor: string) {
  await requireRole(actor, ["admin"]);
  const [{ data: pv }, { data: cats }, { data: areas }, { data: auditRows }, { data: roles }] = await Promise.all([
    db().from("pricing_versions").select("*").order("created_at", { ascending: false }),
    db().from("category_rules").select("*").order("code"),
    db().from("service_areas").select("*"),
    db().from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100),
    db().from("user_roles").select("user_id, role, created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  return { pricingVersions: pv, categories: cats, areas, audit: auditRows, roles };
}

const NUM_KEYS = Object.keys(DEFAULT_PRICING).filter((k) => typeof (DEFAULT_PRICING as unknown as Record<string, unknown>)[k] === "number");

/** New pricing version (history immutable). Activation retires the previous one; existing quotes keep their version. */
export async function publishPricingVersion(actor: string, version: string, changes: Record<string, number>) {
  await requireRole(actor, ["admin"]);
  const current = await loadPricing();
  const next: Record<string, unknown> = { ...current, version };
  for (const [k, v] of Object.entries(changes)) {
    if (!NUM_KEYS.includes(k) || !Number.isSafeInteger(v) || v < 0) throw new AppError("INVALID_PRICING", `Bad value for ${k}`);
    next[k] = v;
  }
  if ((next["driver_shared_payout_multiplier_bps"] as number) < 10000) throw new AppError("INVALID_PRICING", "Shared payout multiplier cannot be below 100% of private payout");
  await db().from("pricing_versions").update({ status: "retired" }).eq("status", "active");
  const { error } = await db().from("pricing_versions").insert({ version, config: next, status: "active", business_approved: false, created_by: actor });
  if (error) throw new AppError("DB_ERROR", error.message);
  await audit(actor, "pricing_version_published", "pricing_versions", version, { changes });
  return { ok: true };
}

export async function grantRole(actor: string, targetUserId: string, role: AppRole, revoke: boolean) {
  await requireRole(actor, ["admin"]);
  if (revoke) {
    if (targetUserId === actor && role === "admin") throw new AppError("SELF_LOCKOUT");
    await db().from("user_roles").delete().eq("user_id", targetUserId).eq("role", role);
  } else {
    await db().from("user_roles").upsert({ user_id: targetUserId, role, granted_by: actor }, { onConflict: "user_id,role" });
  }
  await audit(actor, revoke ? "role_revoked" : "role_granted", "user_roles", targetUserId, { role });
  return { ok: true };
}

// ----- Payments webhook (sandbox) -----
function webhookStore(): WebhookStore {
  return {
    async hasEvent(id) {
      const { data } = await db().from("payment_webhook_events").select("id").eq("provider_event_id", id).maybeSingle();
      return !!data;
    },
    async recordEvent(e) {
      const { error } = await db().from("payment_webhook_events").insert({ provider: "sandbox", provider_event_id: e.eventId, payload: e });
      return !error;
    },
    async getPayment(ref) {
      const { data } = await db().from("payment_records").select("id,amount_paise,status").eq("provider_reference", ref).maybeSingle();
      return data ? { id: data.id, amountPaise: Number(data.amount_paise), status: data.status } : null;
    },
    async setPaymentStatus(id, status) {
      await db().from("payment_records").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    },
    async appendLedger(paymentId, amount, type) {
      const { data } = await db().from("payment_records").select("booking_id").eq("id", paymentId).single();
      await db().from("fare_ledger").insert({ booking_id: data.booking_id, entry_type: type, amount_paise: amount, reason: "SANDBOX payment webhook (no real money)", reference: paymentId });
    },
  };
}

export async function handleSandboxWebhook(rawBody: string, signature: string | null) {
  const secret = process.env["SANDBOX_PAYMENT_WEBHOOK_SECRET"];
  if (!secret) return { status: 503, body: { error: "payments not configured" } };
  if (!(await verifySignature(secret, rawBody, signature))) return { status: 401, body: { error: "invalid signature" } };
  let evt;
  try {
    evt = parseWebhook(rawBody);
  } catch {
    return { status: 400, body: { error: "invalid payload" } };
  }
  const outcome = await processWebhook(webhookStore(), evt);
  await db().from("payment_webhook_events").update({ outcome }).eq("provider_event_id", evt.eventId);
  return { status: 200, body: { outcome } };
}

/** Ops tool: sends a signed SANDBOX webhook through the same verification path. */
export async function simulateSandboxPayment(actor: string, bookingId: string, eventId?: string) {
  await requireRole(actor, ["finance", "admin", "ops_agent"]);
  const { data: pay } = await db().from("payment_records").select("*").eq("booking_id", bookingId).eq("method", "digital").maybeSingle();
  if (!pay) throw new AppError("NO_DIGITAL_PAYMENT");
  const body = JSON.stringify({ eventId: eventId ?? `evt_${newToken(6)}`, paymentReference: pay.provider_reference, status: "succeeded", amountPaise: Number(pay.amount_paise) });
  const sig = await signPayload(process.env["SANDBOX_PAYMENT_WEBHOOK_SECRET"] ?? "", body);
  const res = await handleSandboxWebhook(body, sig);
  await audit(actor, "sandbox_webhook_simulated", "payment_records", pay.id, { result: res.body });
  return res.body;
}

// ----- Trusted contact share -----
export async function createShareLink(userId: string, bookingId: string) {
  const { data: b } = await db().from("bookings").select("passenger_id,share_token").eq("id", bookingId).single();
  if (b?.passenger_id !== userId) throw new AppError("FORBIDDEN");
  if (b.share_token) return { token: b.share_token };
  const token = newToken(16);
  await db().from("bookings").update({ share_token: token }).eq("id", bookingId);
  return { token };
}

export async function sharedTripStatus(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const { data: b } = await db().from("bookings").select("id,state,pickup_label,dropoff_label,updated_at").eq("share_token", token).maybeSingle();
  if (!b) return null;
  const { data: tb } = await db().from("trip_bookings").select("trips(driver_id, vehicle_id)").eq("booking_id", b.id).in("assignment_state", ["confirmed", "completed"]).maybeSingle();
  let driver = null;
  if (tb?.trips) {
    const { data: d } = await db().from("driver_profiles").select("display_name").eq("id", tb.trips.driver_id).single();
    const { data: v } = await db().from("vehicles").select("vehicle_type,registration_ref").eq("id", tb.trips.vehicle_id).single();
    driver = { name: d?.display_name, vehicle: v?.vehicle_type, registration: v?.registration_ref };
  }
  // No precise live location is exposed (none is collected in this build).
  return { state: b.state, pickup: b.pickup_label, dropoff: b.dropoff_label, updatedAt: b.updated_at, driver };
}

export async function myNotifications(userId: string) {
  const { data } = await db().from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  return data ?? [];
}
