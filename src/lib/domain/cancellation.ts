/**
 * Cancellation & no-show rules. Fees default to ₹0 because no charge has been
 * legally approved; the config value is disclosed before confirmation.
 */
import type { BookingState } from "./state-machine";
import type { PricingConfig } from "./pricing";
import { nextGuaranteed, type ReasonCode } from "./pricing";

export type Canceller = "passenger" | "driver" | "ops";

export interface CancellationOutcome {
  allowed: boolean;
  reason?: string;
  feePaise: number;
  rematch: boolean; // driver cancel → passenger goes back to SEARCHING with guarantees intact
  note: string;
}

const PRE_ASSIGN: BookingState[] = ["DRAFT", "QUOTED", "SEARCHING", "MATCH_PROPOSED"];
const POST_ASSIGN: BookingState[] = ["MATCH_CONFIRMED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED"];

export function cancellationOutcome(
  cfg: PricingConfig,
  state: BookingState,
  by: Canceller,
  opts: { arrivedAt?: Date | null; now?: Date } = {},
): CancellationOutcome {
  if (["PASSENGER_ONBOARD", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"].includes(state)) {
    return { allowed: false, reason: "NOT_CANCELLABLE_IN_STATE", feePaise: 0, rematch: false, note: "Use Report issue / Support for in-trip problems." };
  }
  if (by === "driver") {
    if (!POST_ASSIGN.includes(state)) return { allowed: false, reason: "DRIVER_NOT_ASSIGNED", feePaise: 0, rematch: false, note: "" };
    return { allowed: true, feePaise: 0, rematch: true, note: "Passenger re-enters search; guaranteed fare preserved." };
  }
  if (by === "passenger" && PRE_ASSIGN.includes(state)) return { allowed: true, feePaise: 0, rematch: false, note: "Free before a driver is confirmed." };
  if (by === "passenger" && state === "DRIVER_ARRIVED" && opts.arrivedAt) {
    const waited = ((opts.now ?? new Date()).getTime() - new Date(opts.arrivedAt).getTime()) / 1000;
    if (waited > cfg.noshow_grace_s) {
      return { allowed: true, feePaise: cfg.cancellation_fee_paise, rematch: false, note: "After disclosed grace period; configured fee applies (₹0 until legally approved)." };
    }
  }
  return { allowed: true, feePaise: by === "passenger" && POST_ASSIGN.includes(state) ? cfg.cancellation_fee_paise : 0, rematch: false, note: "Disclosed cancellation fee (currently ₹0 pending legal review)." };
}

export function canMarkNoShow(arrivedAt: Date | string | null, cfg: PricingConfig, now = new Date()): boolean {
  if (!arrivedAt) return false;
  return (now.getTime() - new Date(arrivedAt).getTime()) / 1000 >= cfg.noshow_grace_s;
}

/**
 * After a co-passenger leaves, the remaining passengers' payable is
 * min(current guaranteed, re-allocation). It never increases. Any shortfall
 * against the driver target is booked to the platform cancellation reserve.
 */
export function remainingPassengerPayable(currentGuaranteed: number, reallocated: number | null): number {
  return reallocated == null ? currentGuaranteed : nextGuaranteed(currentGuaranteed, reallocated);
}

export type { ReasonCode };
