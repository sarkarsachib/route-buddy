/**
 * Trusted server-side core: privileged DB access, role checks, audit,
 * notifications, pricing config, and the booking state transition primitive.
 * Only imported by *.functions.ts handlers / other *.server.ts modules.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createSimulatedRouting, type RoutingProvider } from "@/lib/domain/geo";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/domain/pricing";
import { canTransition, type ActorRole, type BookingState } from "@/lib/domain/state-machine";

// The generated client is fully typed; server modules use a loose handle so
// enum/text columns can be written without per-call casts. DTOs returned to
// the client are typed at the function boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = (): any => supabaseAdmin;

export type AppRole = "passenger" | "driver" | "ops_agent" | "safety_reviewer" | "finance" | "admin";

export class AppError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

export async function getRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await db().from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r: { role: AppRole }) => r.role);
}

export async function requireRole(userId: string, roles: AppRole[]): Promise<AppRole[]> {
  const mine = await getRoles(userId);
  if (!mine.some((r) => roles.includes(r))) throw new AppError("FORBIDDEN", `Requires one of: ${roles.join(", ")}`);
  return mine;
}

export async function audit(actorId: string | null, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}) {
  await db().from("audit_logs").insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, details });
}

/** In-app notification; SMS adapter is SIMULATED (no provider configured). */
export async function notify(userId: string | null | undefined, title: string, body: string) {
  if (!userId) return;
  await db().from("notifications").insert({ user_id: userId, title, body, channel: "in_app" });
}

export async function loadPricing(): Promise<PricingConfig> {
  const { data } = await db().from("pricing_versions").select("config").eq("status", "active").maybeSingle();
  return { ...DEFAULT_PRICING, ...(data?.config ?? {}) } as PricingConfig;
}

export function routingFor(cfg: PricingConfig): RoutingProvider {
  return createSimulatedRouting({ roadFactorBps: cfg.road_factor_bps, avgSpeedKmph: cfg.avg_speed_kmph });
}

export async function isDemoMode(): Promise<boolean> {
  const { data } = await db().from("app_config").select("value").eq("key", "demo_mode").maybeSingle();
  return data?.value === true;
}

/**
 * The ONLY way booking state changes. Validates the transition + actor in TS,
 * applies an optimistic-concurrency update (version must match), and appends
 * a booking_event. The DB trigger re-validates independently.
 */
export async function transitionBooking(args: {
  bookingId: string;
  to: BookingState;
  actor: ActorRole;
  actorId: string | null;
  reason?: string;
  patch?: Record<string, unknown>;
  expectedFrom?: BookingState[];
}) {
  const { data: b, error } = await db().from("bookings").select("id,state,version,passenger_id").eq("id", args.bookingId).single();
  if (error || !b) throw new AppError("NOT_FOUND", "Booking not found");
  if (args.expectedFrom && !args.expectedFrom.includes(b.state)) throw new AppError("STATE_CONFLICT", `Booking is ${b.state}`);
  const chk = canTransition(b.state, args.to, args.actor);
  if (!chk.ok) throw new AppError("INVALID_TRANSITION", chk.reason);
  const { data: upd, error: uerr } = await db()
    .from("bookings")
    .update({ ...(args.patch ?? {}), state: args.to, version: b.version + 1 })
    .eq("id", b.id)
    .eq("version", b.version)
    .select("id,state,version,passenger_id")
    .maybeSingle();
  if (uerr) throw new AppError("DB_ERROR", uerr.message);
  if (!upd) throw new AppError("CONCURRENT_MODIFICATION", "Booking changed concurrently; retry");
  await db().from("booking_events").insert({ booking_id: b.id, from_state: b.state, to_state: args.to, actor_id: args.actorId, actor_role: args.actor, reason: args.reason ?? null });
  return upd as { id: string; state: BookingState; version: number; passenger_id: string };
}

export function newToken(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
}
