import { describe, expect, it } from "vitest";
import { applyBps, splitByWeights } from "@/lib/domain/money";
import { createSimulatedRouting } from "@/lib/domain/geo";
import { DEFAULT_PRICING as cfg, allocateShared, driverGrossPayout, nextGuaranteed, privateFare, quoteAmounts } from "@/lib/domain/pricing";
import { findMatches, tryAssign, type MatchRequest, type TripCandidate } from "@/lib/domain/matching";
import { canTransition } from "@/lib/domain/state-machine";
import { canRespond, offerBounds, validateOffer } from "@/lib/domain/negotiation";
import { cancellationOutcome, canMarkNoShow, remainingPassengerPayable } from "@/lib/domain/cancellation";
import { processWebhook, signPayload, verifySignature, type WebhookStore } from "@/lib/domain/payments";
import { placeById } from "@/lib/domain/places";

const routing = createSimulatedRouting({ roadFactorBps: cfg.road_factor_bps, avgSpeedKmph: cfg.avg_speed_kmph });
const P = (id: string) => placeById(id)!;
const solo = (a: string, b: string) => {
  const m = routing.leg(P(a), P(b));
  return { m, fare: privateFare(cfg, m).total };
};

describe("money", () => {
  it("split preserves every paisa", () => {
    const parts = splitByWeights(10001, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10001);
  });
  it("rejects non-integer amounts", () => expect(() => applyBps(10.5, 100)).toThrow());
});

describe("pricing", () => {
  it("private fare is integer paise and includes base", () => {
    const f = privateFare(cfg, { distanceM: 10000, durationS: 1200 });
    expect(f.total).toBe(4000 + 14000 + 2000);
    expect(Number.isInteger(f.total)).toBe(true);
  });
  it("minimum fare applies", () => expect(privateFare(cfg, { distanceM: 500, durationS: 60 }).total).toBe(6000));
  it("share & save: guaranteed payable <= ceiling and reference is the genuine private fare", () => {
    const ref = privateFare(cfg, { distanceM: 20000, durationS: 3000 });
    const q = quoteAmounts(cfg, "SHARE_AND_SAVE", ref);
    expect(q.privateReferenceFare).toBe(ref.total);
    expect(q.initialFareCeiling).toBe(ref.total);
    expect(q.currentGuaranteedPayable).toBe(ref.total - q.guaranteedDiscount);
    expect(q.currentGuaranteedPayable).toBeLessThanOrEqual(q.initialFareCeiling);
  });
  it("guaranteed fare never increases", () => {
    expect(nextGuaranteed(50000, 60000)).toBe(50000);
    expect(nextGuaranteed(50000, 40000)).toBe(40000);
  });
  it("shared allocation meets the +5% driver payout target and is passenger-specific", () => {
    const a = solo("duttapukur", "sealdah"), b = solo("barasat", "sealdah");
    const route = routing.leg(P("duttapukur"), P("barasat"));
    const rest = routing.leg(P("barasat"), P("sealdah"));
    const econ = allocateShared(cfg, { distanceM: route.distanceM + rest.distanceM, durationS: route.durationS + rest.durationS }, "hatchback", [
      { bookingId: "A", soloFare: a.fare, cap: a.fare - applyBps(a.fare, 800) },
      { bookingId: "B", soloFare: b.fare, cap: b.fare - applyBps(b.fare, 800) },
    ]);
    expect(econ.feasible).toBe(true);
    expect(econ.driverGrossPayout).toBeGreaterThanOrEqual(Math.ceil(econ.benchmarkDriverPayout * 1.05));
    const [x, y] = econ.allocations;
    expect(x!.amount).not.toBe(y!.amount);
    expect(x!.amount).toBeLessThanOrEqual(x!.cap);
    expect(y!.amount).toBeLessThanOrEqual(y!.cap);
  });
  it("infeasible when caps cannot fund the driver payout floor", () => {
    const econ = allocateShared(cfg, { distanceM: 40000, durationS: 6000 }, "hatchback", [
      { bookingId: "A", soloFare: 30000, cap: 10000 },
      { bookingId: "B", soloFare: 30000, cap: 10000 },
    ]);
    expect(econ.feasible).toBe(false);
    expect(econ.reasons).toContain("DRIVER_PAYOUT_FLOOR_UNMET");
  });
  it("gross payout = fare − commission", () => expect(driverGrossPayout(cfg, 10000)).toBe(8500));
});

function seededTrip(over: Partial<TripCandidate> = {}): TripCandidate {
  const a = solo("duttapukur", "sealdah");
  return {
    tripId: "T1", driverId: "D1", vehicleType: "hatchback", capacity: 4, joinable: true, driverEligible: true, category: null,
    departAt: Date.now(), driverLocation: P("duttapukur"),
    riders: [{ bookingId: "A", count: 1, pickup: P("duttapukur"), dropoff: P("sealdah"), maxDetourPct: 30, soloDistanceM: a.m.distanceM, soloFare: a.fare, cap: a.fare - applyBps(a.fare, 800) }],
    stops: [{ bookingId: "A", type: "pickup", point: P("duttapukur") }, { bookingId: "A", type: "dropoff", point: P("sealdah") }],
    ...over,
  };
}
function req(from: string, to: string, over: Partial<MatchRequest> = {}): MatchRequest {
  const s = solo(from, to);
  return { bookingId: "B", count: 1, pickup: P(from), dropoff: P(to), maxDetourPct: 30, soloDistanceM: s.m.distanceM, soloFare: s.fare, cap: s.fare - applyBps(s.fare, 800), category: null, windowStart: Date.now(), windowEnd: Date.now() + 1800000, ...over };
}

describe("matching", () => {
  it("route overlap: co-passenger on the corridor joins", () => {
    const r = findMatches(req("barasat", "sealdah"), [seededTrip()], cfg, routing);
    expect(r.options).toHaveLength(1);
    const st = r.options[0]!.stops.map((s) => `${s.bookingId}:${s.type}`);
    expect(st.indexOf("B:pickup")).toBeLessThan(st.indexOf("B:dropoff"));
  });
  it("different drop-offs yield different allocations", () => {
    const r = findMatches(req("madhyamgram", "dumdum"), [seededTrip()], cfg, routing);
    expect(r.options.length).toBe(1);
    const al = r.options[0]!.economics.allocations;
    expect(al[0]!.amount).not.toBe(al[1]!.amount);
  });
  it("incompatible route is rejected (pickup too far)", () => {
    const r = findMatches(req("howrah", "esplanade"), [seededTrip()], cfg, routing);
    expect(r.options).toHaveLength(0);
    expect(r.rejections[0]!.reasons).toContain("PICKUP_TOO_FAR");
  });
  it("detour limit is enforced for existing passengers", () => {
    const t = seededTrip();
    t.riders[0]!.maxDetourPct = 0;
    const r = findMatches(req("barasat", "saltlake"), [t], cfg, routing);
    expect(r.options).toHaveLength(0);
    expect(r.rejections[0]!.reasons).toContain("DETOUR_LIMIT_EXCEEDED");
  });
  it("category mismatch is rejected, never substituted", () => {
    const r = findMatches(req("barasat", "sealdah", { category: "WOMEN_ONLY" }), [seededTrip()], cfg, routing);
    expect(r.rejections[0]!.reasons).toContain("CATEGORY_MISMATCH");
  });
  it("capacity is enforced", () => {
    const r = findMatches(req("barasat", "sealdah", { count: 4 }), [seededTrip()], cfg, routing);
    expect(r.options).toHaveLength(0);
    expect(r.rejections[0]!.reasons).toContain("CAPACITY_EXCEEDED");
  });
  it("fare cap / payout floor failure blocks the match", () => {
    const r = findMatches(req("barasat", "sealdah", { cap: 100 }), [seededTrip()], cfg, routing);
    expect(r.options).toHaveLength(0);
    expect(r.rejections[0]!.reasons).toContain("DRIVER_PAYOUT_FLOOR_UNMET");
  });
  it("ineligible driver is rejected", () => {
    const r = findMatches(req("barasat", "sealdah"), [seededTrip({ driverEligible: false })], cfg, routing);
    expect(r.rejections[0]!.reasons).toContain("DRIVER_INELIGIBLE");
  });
  it("concurrent assignment: only one wins per trip version / booking", () => {
    const store = { activeAssignment: new Map<string, string>(), tripVersion: new Map([["T1", 3]]) };
    expect(tryAssign(store, "B", "T1", 3)).toBe(true);
    expect(tryAssign(store, "C", "T1", 3)).toBe(false); // stale version
    expect(tryAssign(store, "B", "T2", 0)).toBe(false); // booking already assigned
  });
});

describe("state machine", () => {
  it("valid path", () => expect(canTransition("IN_PROGRESS", "COMPLETED", "driver").ok).toBe(true));
  it("passenger cannot complete a trip", () => expect(canTransition("IN_PROGRESS", "COMPLETED", "passenger").ok).toBe(false));
  it("cannot skip states", () => expect(canTransition("SEARCHING", "COMPLETED", "system").ok).toBe(false));
  it("terminal states are terminal", () => expect(canTransition("CANCELLED", "SEARCHING", "admin").ok).toBe(false));
});

describe("negotiation", () => {
  const b = offerBounds(cfg, 50000, 48000);
  it("floor is 85% of private reference", () => expect(b.floor).toBe(42500));
  it("rejects above ceiling and below floor", () => {
    expect(validateOffer(49000, b).reason).toBe("ABOVE_FARE_CEILING");
    expect(validateOffer(40000, b).reason).toBe("BELOW_DRIVER_FLOOR");
    expect(validateOffer(45000, b).ok).toBe(true);
  });
  it("expired offers cannot be accepted", () => {
    expect(canRespond("open", new Date(Date.now() - 1000), "driver", "passenger").reason).toBe("OFFER_EXPIRED");
    expect(canRespond("open", new Date(Date.now() + 60000), "passenger", "passenger").reason).toBe("CANNOT_RESPOND_TO_OWN_OFFER");
  });
});

describe("cancellation", () => {
  it("free before driver confirmation", () => expect(cancellationOutcome(cfg, "SEARCHING", "passenger").feePaise).toBe(0));
  it("not cancellable once onboard", () => expect(cancellationOutcome(cfg, "IN_PROGRESS", "passenger").allowed).toBe(false));
  it("driver cancellation re-matches passenger", () => expect(cancellationOutcome(cfg, "MATCH_CONFIRMED", "driver").rematch).toBe(true));
  it("no-show only after grace", () => {
    expect(canMarkNoShow(new Date(Date.now() - 60000), cfg)).toBe(false);
    expect(canMarkNoShow(new Date(Date.now() - 301000), cfg)).toBe(true);
  });
  it("co-passenger cancellation never raises remaining fare", () => expect(remainingPassengerPayable(30000, 45000)).toBe(30000));
});

describe("payments webhook", () => {
  it("verifies signatures", async () => {
    const sig = await signPayload("s3cret", "body");
    expect(await verifySignature("s3cret", "body", sig)).toBe(true);
    expect(await verifySignature("s3cret", "tampered", sig)).toBe(false);
  });
  it("duplicate webhook has exactly one effect", async () => {
    const events = new Set<string>();
    let ledger = 0;
    const pay = { id: "p1", amountPaise: 5000, status: "pending" };
    const store: WebhookStore = {
      hasEvent: async (id) => events.has(id),
      recordEvent: async (e) => (events.has(e.eventId) ? false : (events.add(e.eventId), true)),
      getPayment: async () => pay,
      setPaymentStatus: async (_, s) => void (pay.status = s),
      appendLedger: async () => void ledger++,
    };
    const e = { eventId: "evt1", paymentReference: "r", status: "succeeded" as const, amountPaise: 5000 };
    expect(await processWebhook(store, e)).toBe("processed");
    expect(await processWebhook(store, e)).toBe("duplicate");
    expect(ledger).toBe(1);
  });
  it("amount mismatch is not applied", async () => {
    const store: WebhookStore = { hasEvent: async () => false, recordEvent: async () => true, getPayment: async () => ({ id: "p", amountPaise: 5000, status: "pending" }), setPaymentStatus: async () => { throw new Error("must not"); }, appendLedger: async () => {} };
    expect(await processWebhook(store, { eventId: "x", paymentReference: "r", status: "succeeded", amountPaise: 1 })).toBe("amount_mismatch");
  });
});
