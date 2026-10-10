import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as ops from "./ops.server";

const wrap = async <T,>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw new Error((e as Error).message ?? "Request failed");
  }
};
const roleEnum = z.enum(["passenger", "driver", "ops_agent", "safety_reviewer", "finance", "admin"]);

export const getOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(({ context }) => wrap(() => ops.overview(context.userId)));
export const getReconciliation = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(({ context }) => wrap(() => ops.reconciliation(context.userId)));
export const getIncidents = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(({ context }) => wrap(() => ops.incidents(context.userId)));
export const getAdminConfig = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(({ context }) => wrap(() => ops.adminConfig(context.userId)));

export const setDriverVerification = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ driverId: z.string().uuid(), status: z.enum(["verified", "rejected", "in_review"]), notes: z.string().max(500) }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.setDriverVerification(context.userId, data.driverId, data.status, data.notes)));
export const createSettlement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ driverId: z.string().uuid() }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.createSettlement(context.userId, data.driverId)));
export const decideRefund = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refundId: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.decideRefund(context.userId, data.refundId, data.approve)));
export const actOnIncident = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), action: z.enum(["triage", "escalate", "review", "interim_restrict", "resolve", "appeal"]), severity: z.enum(["low", "medium", "high", "critical"]).optional(), notes: z.string().min(3).max(2000), restrictHours: z.number().int().optional() }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.actOnIncident(context.userId, data.id, data.action, data)));
export const updateSupportCase = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["in_progress", "resolved"]) }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.updateSupportCase(context.userId, data.id, data.status)));
export const publishPricing = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ version: z.string().regex(/^[a-z0-9.-]{2,40}$/), changes: z.record(z.number().int()) }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.publishPricingVersion(context.userId, data.version, data.changes)));
export const grantRole = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), role: roleEnum, revoke: z.boolean() }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.grantRole(context.userId, data.userId, data.role, data.revoke)));
export const simulatePayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid(), eventId: z.string().max(60).optional() }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.simulateSandboxPayment(context.userId, data.bookingId, data.eventId)));
