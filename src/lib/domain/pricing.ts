/**
 * Pricing module — versioned. ALL amounts are integer paise.
 *
 * Method "hybrid-v0.1" is a RECOMMENDATION that has NOT been approved by the
 * business (see docs/PRICING.md and docs/OPEN_DECISIONS.md). Every result
 * carries the pricing version + method so stored snapshots stay traceable.
 */
import { applyBps, assertPaise, ceilDiv, splitByWeights, type Paise } from "./money";
import type { LegMetrics } from "./geo";

export const ALLOCATION_METHOD = "hybrid-v0.1-UNAPPROVED";

export type VehicleType = "hatchback" | "sedan" | "suv";
export type RideMode = "PRIVATE" | "SHARE_AND_SAVE" | "SHARED_NOW" | "BUDGET" | "GROUP_PRIVATE";

export interface PricingConfig {
  version: string;
  base_fare_paise: number;
  per_km_paise: number;
  per_min_paise: number; // time component — must be legally permitted & disclosed
  min_fare_paise: number;
  platform_commission_bps: number;
  share_guaranteed_discount_bps: number;
  share_potential_max_discount_bps: number;
  driver_shared_payout_multiplier_bps: number; // 10500 = 105%
  driver_operating_cost_per_km_paise: number;
  vehicle_multiplier_bps: Record<VehicleType, number>;
  negotiation_min_fare_bps: number;
  quote_ttl_s: number;
  offer_ttl_s: number;
  noshow_grace_s: number;
  cancellation_fee_paise: number;
  max_pickup_radius_m: number;
  road_factor_bps: number;
  avg_speed_kmph: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  version: "v1-demo",
  base_fare_paise: 4000,
  per_km_paise: 1400,
  per_min_paise: 100,
  min_fare_paise: 6000,
  platform_commission_bps: 1500,
  share_guaranteed_discount_bps: 800,
  share_potential_max_discount_bps: 4000,
  driver_shared_payout_multiplier_bps: 10500,
  driver_operating_cost_per_km_paise: 500,
  vehicle_multiplier_bps: { hatchback: 10000, sedan: 11500, suv: 14000 },
  negotiation_min_fare_bps: 8500,
  quote_ttl_s: 600,
  offer_ttl_s: 180,
  noshow_grace_s: 300,
  cancellation_fee_paise: 0,
  max_pickup_radius_m: 4000,
  road_factor_bps: 13000,
  avg_speed_kmph: 22,
};

export interface FareBreakdown {
  base: Paise;
  distance: Paise;
  time: Paise;
  vehicleAdjustment: Paise;
  tolls: Paise;
  minFareTopUp: Paise;
  total: Paise;
}

/** Genuine private fare for a route. This is the ONLY reference baseline for savings. */
export function privateFare(
  cfg: PricingConfig,
  m: LegMetrics,
  vehicle: VehicleType = "hatchback",
  tollsPaise: Paise = 0,
): FareBreakdown {
  assertPaise(tollsPaise, "tolls");
  const base = cfg.base_fare_paise;
  const distance = Math.round((cfg.per_km_paise * m.distanceM) / 1000);
  const time = Math.round((cfg.per_min_paise * m.durationS) / 60);
  const sub = base + distance + time;
  const vehicleAdjustment = applyBps(sub, cfg.vehicle_multiplier_bps[vehicle]) - sub;
  const pre = sub + vehicleAdjustment;
  const minFareTopUp = Math.max(0, cfg.min_fare_paise - pre);
  return { base, distance, time, vehicleAdjustment, tolls: tollsPaise, minFareTopUp, total: pre + minFareTopUp + tollsPaise };
}

export function platformFee(cfg: PricingConfig, fare: Paise): Paise {
  return applyBps(fare, cfg.platform_commission_bps);
}

/** Gross driver payout semantics: passenger fare minus platform commission (tolls pass through). NOT net earnings. */
export function driverGrossPayout(cfg: PricingConfig, fare: Paise): Paise {
  return fare - platformFee(cfg, fare);
}

export interface QuoteAmounts {
  mode: RideMode;
  privateReferenceFare: Paise;
  initialFareCeiling: Paise;
  guaranteedDiscount: Paise;
  currentGuaranteedPayable: Paise;
  potentialAdditionalDiscount: Paise;
  requiresMatch: boolean;
  notes: string[];
}

export function quoteAmounts(
  cfg: PricingConfig,
  mode: RideMode,
  ref: FareBreakdown,
  budgetPaise?: Paise,
): QuoteAmounts {
  const r = ref.total;
  const notes: string[] = [];
  switch (mode) {
    case "PRIVATE":
    case "GROUP_PRIVATE":
      return { mode, privateReferenceFare: r, initialFareCeiling: r, guaranteedDiscount: 0, currentGuaranteedPayable: r, potentialAdditionalDiscount: 0, requiresMatch: false, notes };
    case "SHARE_AND_SAVE":
    case "SHARED_NOW": {
      const gd = applyBps(r, cfg.share_guaranteed_discount_bps);
      const maxDisc = applyBps(r, cfg.share_potential_max_discount_bps);
      notes.push("Potential savings are conditional on a compatible co-passenger joining.");
      return { mode, privateReferenceFare: r, initialFareCeiling: r, guaranteedDiscount: gd, currentGuaranteedPayable: r - gd, potentialAdditionalDiscount: Math.max(0, maxDisc - gd), requiresMatch: mode === "SHARED_NOW", notes };
    }
    case "BUDGET": {
      if (budgetPaise == null) throw new Error("budget required");
      assertPaise(budgetPaise, "budget");
      if (budgetPaise >= r) {
        notes.push("Your budget covers a private ride at the standard fare.");
        return { mode, privateReferenceFare: r, initialFareCeiling: r, guaranteedDiscount: 0, currentGuaranteedPayable: r, potentialAdditionalDiscount: 0, requiresMatch: false, notes };
      }
      notes.push("Below the private fare: confirmed only if a feasible shared match or driver acceptance is found.");
      return { mode, privateReferenceFare: r, initialFareCeiling: budgetPaise, guaranteedDiscount: 0, currentGuaranteedPayable: budgetPaise, potentialAdditionalDiscount: 0, requiresMatch: true, notes };
    }
  }
}

export interface AllocationInput {
  bookingId: string;
  soloFare: Paise; // genuine private fare for this passenger's own route
  cap: Paise; // current guaranteed payable — allocation can never exceed it
}

export type ReasonCode =
  | "OK"
  | "DRIVER_PAYOUT_FLOOR_UNMET"
  | "FARE_CEILING_EXCEEDED"
  | "DRIVER_NET_NEGATIVE"
  | "CAPACITY_EXCEEDED"
  | "DETOUR_LIMIT_EXCEEDED"
  | "CATEGORY_MISMATCH"
  | "CATEGORY_UNAVAILABLE"
  | "PICKUP_TOO_FAR"
  | "TIME_WINDOW_MISMATCH"
  | "DRIVER_INELIGIBLE"
  | "TRIP_NOT_JOINABLE"
  | "PICKUP_ORDER_INVALID";

export interface SharedEconomics {
  feasible: boolean;
  reasons: ReasonCode[];
  method: string;
  pricingVersion: string;
  routeFare: Paise; // private fare for the full shared route (benchmark basis)
  benchmarkDriverPayout: Paise; // comparable private payout for same route/time/vehicle
  targetDriverPayout: Paise; // >= 105% of benchmark
  requiredPassengerTotal: Paise;
  allocations: { bookingId: string; amount: Paise; soloFare: Paise; cap: Paise }[];
  driverGrossPayout: Paise;
  platformContribution: Paise;
  driverOperatingCost: Paise;
  driverEstimatedNet: Paise;
}

/**
 * HYBRID incremental-cost allocation:
 *  - required total R is the smallest amount whose gross payout meets the
 *    +5% target over the comparable private payout for the SAME full route;
 *  - the shared base fare is split equally;
 *  - the remainder is split in proportion to each passenger's own
 *    distance/time contribution (solo fare minus base), so different
 *    pickups/dropoffs yield different fares;
 *  - no passenger may exceed their cap; excess is re-spread over passengers
 *    with headroom; if impossible → infeasible (never relaxed).
 */
export function allocateShared(
  cfg: PricingConfig,
  routeMetrics: LegMetrics,
  vehicle: VehicleType,
  passengers: AllocationInput[],
  tollsPaise: Paise = 0,
): SharedEconomics {
  const routeFare = privateFare(cfg, routeMetrics, vehicle, tollsPaise).total;
  const benchmark = driverGrossPayout(cfg, routeFare);
  const target = ceilDiv(benchmark * cfg.driver_shared_payout_multiplier_bps, 10000);
  let R = ceilDiv(target * 10000, 10000 - cfg.platform_commission_bps);
  while (driverGrossPayout(cfg, R) < target) R++;
  const opCost = Math.round((cfg.driver_operating_cost_per_km_paise * routeMetrics.distanceM) / 1000);
  const base = {
    method: ALLOCATION_METHOD,
    pricingVersion: cfg.version,
    routeFare,
    benchmarkDriverPayout: benchmark,
    targetDriverPayout: target,
    requiredPassengerTotal: R,
    driverOperatingCost: opCost,
  };
  const n = passengers.length;
  const capSum = passengers.reduce((a, p) => a + p.cap, 0);
  if (n === 0 || capSum < R) {
    return { ...base, feasible: false, reasons: ["DRIVER_PAYOUT_FLOOR_UNMET"], allocations: passengers.map((p) => ({ ...p, amount: p.cap })), driverGrossPayout: 0, platformContribution: 0, driverEstimatedNet: 0 };
  }
  const baseShare = Math.min(cfg.base_fare_paise, R);
  const baseParts = splitByWeights(baseShare, passengers.map(() => 1));
  const varParts = splitByWeights(R - baseShare, passengers.map((p) => Math.max(1, p.soloFare - cfg.base_fare_paise)));
  const amt = passengers.map((_, i) => baseParts[i]! + varParts[i]!);
  // water-fill excess over caps
  for (let iter = 0; iter < n + 1; iter++) {
    let excess = 0;
    const free: number[] = [];
    amt.forEach((a, i) => {
      if (a > passengers[i]!.cap) {
        excess += a - passengers[i]!.cap;
        amt[i] = passengers[i]!.cap;
      } else if (a < passengers[i]!.cap) free.push(i);
    });
    if (excess === 0) break;
    if (free.length === 0) break;
    const add = splitByWeights(excess, free.map((i) => Math.max(1, passengers[i]!.soloFare - cfg.base_fare_paise)));
    free.forEach((i, k) => (amt[i]! += add[k]!));
  }
  const total = amt.reduce((a, b) => a + b, 0);
  const reasons: ReasonCode[] = [];
  if (total < R) reasons.push("DRIVER_PAYOUT_FLOOR_UNMET");
  if (amt.some((a, i) => a > passengers[i]!.cap)) reasons.push("FARE_CEILING_EXCEEDED");
  const payout = driverGrossPayout(cfg, total);
  if (payout < target && !reasons.includes("DRIVER_PAYOUT_FLOOR_UNMET")) reasons.push("DRIVER_PAYOUT_FLOOR_UNMET");
  if (payout - opCost <= 0) reasons.push("DRIVER_NET_NEGATIVE");
  return {
    ...base,
    feasible: reasons.length === 0,
    reasons: reasons.length ? reasons : ["OK"],
    allocations: passengers.map((p, i) => ({ bookingId: p.bookingId, amount: amt[i]!, soloFare: p.soloFare, cap: p.cap })),
    driverGrossPayout: payout,
    platformContribution: total - payout,
    driverEstimatedNet: payout - opCost,
  };
}

/**
 * Guaranteed payable is monotonic non-increasing. A new allocation may lower
 * it, never raise it (co-passenger cancellations, re-matches, etc.).
 */
export function nextGuaranteed(current: Paise, proposed: Paise): Paise {
  assertPaise(current);
  assertPaise(proposed);
  return Math.min(current, proposed);
}
