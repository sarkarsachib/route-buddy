/**
 * Booking state machine. Mirrored by a database trigger
 * (public.enforce_booking_transition) so it holds even if server code is wrong.
 */
export const BOOKING_STATES = [
  "DRAFT",
  "QUOTED",
  "SEARCHING",
  "MATCH_PROPOSED",
  "MATCH_CONFIRMED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "PASSENGER_ONBOARD",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "SUPPORT_REVIEW",
] as const;
export type BookingState = (typeof BOOKING_STATES)[number];

export type ActorRole = "passenger" | "driver" | "system" | "ops_agent" | "admin" | "safety_reviewer";

const T: Record<BookingState, BookingState[]> = {
  DRAFT: ["QUOTED", "CANCELLED"],
  QUOTED: ["SEARCHING", "MATCH_CONFIRMED", "EXPIRED", "CANCELLED"],
  SEARCHING: ["MATCH_PROPOSED", "EXPIRED", "CANCELLED", "SUPPORT_REVIEW"],
  MATCH_PROPOSED: ["MATCH_CONFIRMED", "SEARCHING", "CANCELLED", "EXPIRED"],
  MATCH_CONFIRMED: ["DRIVER_EN_ROUTE", "SEARCHING", "CANCELLED", "SUPPORT_REVIEW"],
  DRIVER_EN_ROUTE: ["DRIVER_ARRIVED", "SEARCHING", "CANCELLED", "SUPPORT_REVIEW"],
  DRIVER_ARRIVED: ["PASSENGER_ONBOARD", "CANCELLED", "SUPPORT_REVIEW"],
  PASSENGER_ONBOARD: ["IN_PROGRESS", "SUPPORT_REVIEW"],
  IN_PROGRESS: ["COMPLETED", "SUPPORT_REVIEW"],
  COMPLETED: ["SUPPORT_REVIEW"],
  CANCELLED: [],
  EXPIRED: [],
  SUPPORT_REVIEW: ["CANCELLED", "COMPLETED", "SEARCHING"],
};

/** Which actor roles may drive which target states. Completion is driver/system/staff only. */
const WHO: Partial<Record<BookingState, ActorRole[]>> = {
  DRIVER_EN_ROUTE: ["driver", "system"],
  DRIVER_ARRIVED: ["driver", "system"],
  PASSENGER_ONBOARD: ["driver", "system"],
  IN_PROGRESS: ["driver", "system"],
  COMPLETED: ["driver", "system", "ops_agent", "admin"],
  MATCH_CONFIRMED: ["driver", "system", "passenger"],
  MATCH_PROPOSED: ["system"],
  SEARCHING: ["system", "passenger", "driver", "ops_agent", "admin"],
  SUPPORT_REVIEW: ["system", "ops_agent", "admin", "safety_reviewer", "passenger", "driver"],
  EXPIRED: ["system"],
};

export function canTransition(from: BookingState, to: BookingState, actor: ActorRole): { ok: boolean; reason?: string } {
  if (!T[from]?.includes(to)) return { ok: false, reason: `INVALID_TRANSITION ${from}->${to}` };
  const allowed = WHO[to];
  if (allowed && !allowed.includes(actor)) return { ok: false, reason: `ACTOR_NOT_PERMITTED ${actor}->${to}` };
  return { ok: true };
}

export function assertTransition(from: BookingState, to: BookingState, actor: ActorRole): void {
  const r = canTransition(from, to, actor);
  if (!r.ok) throw new Error(r.reason);
}

export const ACTIVE_STATES: BookingState[] = [
  "SEARCHING",
  "MATCH_PROPOSED",
  "MATCH_CONFIRMED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "PASSENGER_ONBOARD",
  "IN_PROGRESS",
];

export function allowedTransitions(): Record<BookingState, BookingState[]> {
  return T;
}
