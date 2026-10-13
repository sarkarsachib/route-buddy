import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { advanceBooking, collectCash, driverCancel, markNoShow, respondAssignment } from "@/lib/api/driver.functions";
import { respondOffer } from "@/lib/api/passenger.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Money, Panel, RouteStrip, StateBadge, errMsg } from "./ui";

const NEXT: Record<string, { to: "DRIVER_EN_ROUTE" | "DRIVER_ARRIVED" | "PASSENGER_ONBOARD" | "IN_PROGRESS" | "COMPLETED"; label: string }> = {
  MATCH_CONFIRMED: { to: "DRIVER_EN_ROUTE", label: "Start driving to pickup" },
  DRIVER_EN_ROUTE: { to: "DRIVER_ARRIVED", label: "Arrived at pickup" },
  DRIVER_ARRIVED: { to: "PASSENGER_ONBOARD", label: "Passenger onboard" },
  PASSENGER_ONBOARD: { to: "IN_PROGRESS", label: "Start trip" },
  IN_PROGRESS: { to: "COMPLETED", label: "Complete at drop-off" },
};

/** Shared by the real driver dashboard and the ops DEMO-driver simulator (demo=true). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DriverTripControls({ data, demo, onChange }: { data: any; demo: boolean; onChange: () => void }) {
  const resp = useServerFn(respondAssignment);
  const adv = useServerFn(advanceBooking);
  const canc = useServerFn(driverCancel);
  const ns = useServerFn(markNoShow);
  const cash = useServerFn(collectCash);
  const off = useServerFn(respondOffer);
  const [counter, setCounter] = useState<Record<string, string>>({});
  const run = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => { toast.success("Updated"); onChange(); },
    onError: (e) => { toast.error(errMsg(e)); onChange(); },
  });
  const demoAct = demo || undefined;
  return (
    <>
      {data.offers.length > 0 && (
        <Panel title="Negotiation offers">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {data.offers.map((o: any) => (
            <div key={o.id} className="rounded border p-3 text-sm">
              <p>{o.bookings?.pickup_label} → {o.bookings?.dropoff_label} · offer <Money paise={o.amount_paise} /> (private ref <Money paise={o.bookings?.private_reference_fare} />)</p>
              <p className="text-xs text-muted-foreground">Expires {new Date(o.expires_at).toLocaleTimeString()}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => run.mutate(() => off({ data: { offerId: o.id, response: "accept", demoAct } }))}>Accept</Button>
                <Button size="sm" variant="outline" onClick={() => run.mutate(() => off({ data: { offerId: o.id, response: "reject", demoAct } }))}>Reject</Button>
                <Input className="h-8 w-24" placeholder="₹" value={counter[o.id] ?? ""} onChange={(e) => setCounter({ ...counter, [o.id]: e.target.value.replace(/\D/g, "") })} />
                <Button size="sm" variant="secondary" disabled={!counter[o.id]} onClick={() => run.mutate(() => off({ data: { offerId: o.id, response: "counter", counterPaise: Number(counter[o.id]) * 100, demoAct } }))}>Counteroffer</Button>
              </div>
            </div>
          ))}
        </Panel>
      )}
      <Panel title="Current trip">
        {!data.trip ? <Empty>No active trip. {demo ? "" : "Go online to receive offers."}</Empty> : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {data.assignments.map((a: any) => {
                const b = a.bookings;
                const step = NEXT[b.state];
                return (
                  <div key={a.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between"><b>{b.pickup_label} → {b.dropoff_label}</b><StateBadge state={b.state} /></div>
                    <p className="text-xs text-muted-foreground">{b.passenger_count} seat(s) · {b.payment_method} · fare <Money paise={b.current_guaranteed_payable} /></p>
                    {a.payoutPreview && a.assignment_state === "proposed" && (
                      <div className="mt-2 rounded bg-secondary p-2 text-xs">
                        <div>Gross payout est.: <Money paise={a.payoutPreview.driverGrossPayout} /> {a.payoutPreview.targetDriverPayout ? <>(target ≥ <Money paise={a.payoutPreview.targetDriverPayout} />)</> : null}</div>
                        <div>Comparable private payout: <Money paise={a.payoutPreview.benchmarkDriverPayout} /></div>
                        {a.payoutPreview.driverOperatingCost != null && <div>Est. operating cost: <Money paise={a.payoutPreview.driverOperatingCost} /> · est. net <Money paise={a.payoutPreview.driverEstimatedNet} /></div>}
                        {a.payoutPreview.addedDistanceM != null && <div>Added distance: {(a.payoutPreview.addedDistanceM / 1000).toFixed(1)} km</div>}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {a.assignment_state === "proposed" && <>
                        <Button size="sm" variant="accent" onClick={() => run.mutate(() => resp({ data: { bookingId: b.id, accept: true, demoAct } }))}>Accept</Button>
                        <Button size="sm" variant="outline" onClick={() => run.mutate(() => resp({ data: { bookingId: b.id, accept: false, demoAct } }))}>Reject</Button>
                      </>}
                      {a.assignment_state === "confirmed" && step && <Button size="sm" onClick={() => run.mutate(() => adv({ data: { bookingId: b.id, to: step.to, demoAct } }))}>{step.label}</Button>}
                      {a.assignment_state === "confirmed" && ["MATCH_CONFIRMED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED"].includes(b.state) && <Button size="sm" variant="ghost" onClick={() => run.mutate(() => canc({ data: { bookingId: b.id, reason: "driver unable", demoAct } }))}>Cancel</Button>}
                      {b.state === "DRIVER_ARRIVED" && <Button size="sm" variant="ghost" onClick={() => run.mutate(() => ns({ data: { bookingId: b.id, demoAct } }))}>Mark no-show</Button>}
                      {a.assignment_state === "completed" && b.payment_method === "cash" && <Button size="sm" variant="secondary" onClick={() => run.mutate(() => cash({ data: { bookingId: b.id, demoAct } }))}>Cash collected</Button>}
                    </div>
                    {b.state === "DRIVER_ARRIVED" && <p className="mt-1 text-xs text-muted-foreground">No-show available {Math.round(data.noshowGraceS / 60)} min after arrival.</p>}
                  </div>
                );
              })}
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <RouteStrip stops={data.stops.map((s: any) => ({ label: s.label, type: s.stop_type, status: s.status }))} />
          </div>
        )}
      </Panel>
    </>
  );
}
