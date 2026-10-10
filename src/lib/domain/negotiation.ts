/**
 * Negotiation rules. Offers are integer paise and can never bypass the
 * passenger's fare ceiling or the driver minimum (negotiation floor).
 */
import { applyBps, assertPaise, type Paise } from "./money";
import type { PricingConfig } from "./pricing";

export type OfferParty = "passenger" | "driver";
export type OfferStatus = "open" | "accepted" | "rejected" | "countered" | "expired";

export interface OfferBounds {
  floor: Paise; // minimum acceptable for the driver economics
  ceiling: Paise; // passenger's confirmed ceiling
}

export function offerBounds(cfg: PricingConfig, privateReference: Paise, passengerCeiling: Paise): OfferBounds {
  return { floor: applyBps(privateReference, cfg.negotiation_min_fare_bps), ceiling: passengerCeiling };
}

export function validateOffer(amount: Paise, b: OfferBounds): { ok: boolean; reason?: string } {
  try {
    assertPaise(amount, "offer");
  } catch {
    return { ok: false, reason: "NOT_INTEGER_PAISE" };
  }
  if (b.floor > b.ceiling) return { ok: false, reason: "NO_FEASIBLE_RANGE" };
  if (amount < b.floor) return { ok: false, reason: "BELOW_DRIVER_FLOOR" };
  if (amount > b.ceiling) return { ok: false, reason: "ABOVE_FARE_CEILING" };
  return { ok: true };
}

export function isExpired(expiresAt: Date | string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function canRespond(status: OfferStatus, expiresAt: Date | string, responder: OfferParty, creator: OfferParty, now = new Date()) {
  if (status !== "open") return { ok: false, reason: "OFFER_NOT_OPEN" };
  if (isExpired(expiresAt, now)) return { ok: false, reason: "OFFER_EXPIRED" };
  if (responder === creator) return { ok: false, reason: "CANNOT_RESPOND_TO_OWN_OFFER" };
  return { ok: true };
}
