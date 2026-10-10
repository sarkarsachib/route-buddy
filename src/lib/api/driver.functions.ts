import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as svc from "./booking.server";
import { requireRole } from "./core.server";

const wrap = async <T,>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw new Error((e as Error).message ?? "Request failed");
  }
};
const bk = z.object({ bookingId: z.string().uuid(), demoAct: z.boolean().optional() });
// demoAct = staff simulating a seeded DEMO driver (no login). Requires ops/admin role AND is_demo driver.
async function guardDemo(userId: string, demoAct?: boolean) {
  if (demoAct) await requireRole(userId, ["ops_agent", "admin"]);
  return !!demoAct;
}

export const getDriverDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(({ context }) => wrap(async () => svc.driverDashboardFor(await svc.myDriverId(context.userId))));

export const setAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.enum(["online", "offline"]), lat: z.number().optional(), lng: z.number().optional() }).parse(d))
  .handler(({ data, context }) => wrap(() => svc.setAvailability(context.userId, data.status, data.lat, data.lng)));

export const respondAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bk.extend({ accept: z.boolean() }).parse(d))
  .handler(({ data, context }) => wrap(async () => {
    const demo = await guardDemo(context.userId, data.demoAct);
    return data.accept ? svc.acceptProposal(context.userId, data.bookingId, demo) : svc.rejectProposal(context.userId, data.bookingId, demo);
  }));

export const advanceBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bk.extend({ to: z.enum(["DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_ONBOARD", "IN_PROGRESS", "COMPLETED"]) }).parse(d))
  .handler(({ data, context }) => wrap(async () => svc.advanceBooking(context.userId, data.bookingId, data.to, await guardDemo(context.userId, data.demoAct))));

export const driverCancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bk.extend({ reason: z.string().min(1).max(300) }).parse(d))
  .handler(({ data, context }) => wrap(async () => svc.cancelByDriver(context.userId, data.bookingId, data.reason, await guardDemo(context.userId, data.demoAct))));

export const markNoShow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bk.parse(d))
  .handler(({ data, context }) => wrap(async () => svc.markNoShow(context.userId, data.bookingId, await guardDemo(context.userId, data.demoAct))));

export const collectCash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bk.parse(d))
  .handler(({ data, context }) => wrap(async () => svc.collectCash(context.userId, data.bookingId, await guardDemo(context.userId, data.demoAct))));

export const demoDriverDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ driverId: z.string().uuid() }).parse(d))
  .handler(({ data, context }) => wrap(async () => {
    await requireRole(context.userId, ["ops_agent", "admin"]);
    return svc.driverDashboardFor(data.driverId);
  }));
