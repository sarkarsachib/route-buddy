import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as svc from "./booking.server";
import * as ops from "./ops.server";
import { getRoles } from "./core.server";

const pt = z.object({ label: z.string().min(1).max(120), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const wrap = async <T,>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    throw new Error(err.code && err.message && err.code !== err.message ? `${err.message}` : err.message ?? "Request failed");
  }
};

export const getMe = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(({ context }) => wrap(() => ops.me(context.userId)));

export const createQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pickup: pt, dropoff: pt, mode: z.enum(["PRIVATE", "SHARE_AND_SAVE", "SHARED_NOW", "BUDGET", "GROUP_PRIVATE"]), passengerCount: z.number().int().min(1).max(6), vehicleType: z.enum(["hatchback", "sedan", "suv"]), budgetPaise: z.number().int().positive().optional(), departAt: z.string().optional(), maxDetourPct: z.number().int().min(0).max(100), category: z.string().nullable().optional() }).parse(d))
  .handler(({ data, context }) => wrap(() => svc.createQuote(context.userId, data)));

export const confirmBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ quoteId: z.string().uuid(), idempotencyKey: z.string().min(8).max(80), paymentMethod: z.enum(["cash", "digital"]), departAt: z.string().optional(), maxDetourPct: z.number().int().min(0).max(100), language: z.enum(["en", "bn", "hi"]).optional(), accessibility: z.record(z.unknown()).optional() }).parse(d))
  .handler(({ data, context }) => wrap(() => svc.confirmBooking(context.userId, data)));

export const listMyBookings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(({ context }) => wrap(() => svc.listMyBookings(context.userId)));

export const getBookingDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(({ data, context }) => wrap(async () => {
    const roles = await getRoles(context.userId);
    return svc.bookingDetailFor(context.userId, data.bookingId, roles.some((r) => ["ops_agent", "admin", "finance", "safety_reviewer"].includes(r)));
  }));

export const cancelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid(), reason: z.string().min(1).max(300) }).parse(d))
  .handler(({ data, context }) => wrap(() => svc.cancelByPassenger(context.userId, data.bookingId, data.reason)));

export const retrySearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(({ data, context }) => wrap(() => svc.retrySearch(context.userId, data.bookingId)));

export const makeOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid(), amountPaise: z.number().int().positive() }).parse(d))
  .handler(({ data, context }) => wrap(() => svc.passengerOffer(context.userId, data.bookingId, data.amountPaise)));

export const respondOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offerId: z.string().uuid(), response: z.enum(["accept", "reject", "counter"]), counterPaise: z.number().int().positive().optional(), demoAct: z.boolean().optional() }).parse(d))
  .handler(({ data, context }) => wrap(() => svc.respondToOffer(context.userId, data.offerId, data.response, data.counterPaise, data.demoAct ?? false)));

export const reportIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid().nullable().optional(), category: z.enum(["physical_safety", "harassment", "accident", "route_deviation", "vehicle_condition", "other"]), description: z.string().min(5).max(4000), role: z.enum(["passenger", "driver"]) }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.reportIncident(context.userId, data)));

export const openSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid().nullable(), category: z.enum(["fare", "driver", "lost_item", "app", "other"]), description: z.string().min(5).max(4000) }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.openSupportCase(context.userId, data.bookingId, data.category, data.description)));

export const requestRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid(), amountPaise: z.number().int().positive(), reason: z.string().min(3).max(500) }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.requestRefund(context.userId, data.bookingId, data.amountPaise, data.reason)));

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.createShareLink(context.userId, data.bookingId)));

export const myNotifications = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(({ context }) => wrap(() => ops.myNotifications(context.userId)));

export const claimDemoRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ role: z.enum(["driver", "ops_agent", "safety_reviewer", "finance", "admin"]) }).parse(d))
  .handler(({ data, context }) => wrap(() => ops.claimDemoRole(context.userId, data.role)));

export const getSharedTrip = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().max(64) }).parse(d))
  .handler(({ data }) => wrap(() => ops.sharedTripStatus(data.token)));
