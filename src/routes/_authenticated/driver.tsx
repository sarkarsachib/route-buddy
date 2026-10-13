import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getDriverDashboard, setAvailability } from "@/lib/api/driver.functions";
import { reportIncident } from "@/lib/api/passenger.functions";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, Money, Panel, errMsg } from "@/components/tandem/ui";
import { DriverTripControls } from "@/components/tandem/DriverTripControls";

export const Route = createFileRoute("/_authenticated/driver")({
  head: () => ({ meta: [{ title: "Driver · Tandem" }, { name: "description", content: "Availability, offers, trip stops and payout preview." }, { property: "og:title", content: "Driver · Tandem" }, { property: "og:description", content: "Driver dashboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DriverPage,
});

function DriverPage() {
  const qc = useQueryClient();
  const fn = useServerFn(getDriverDashboard);
  const q = useQuery({ queryKey: ["driver"], queryFn: () => fn(), refetchInterval: 6000 });
  const avFn = useServerFn(setAvailability);
  const av = useMutation({ mutationFn: (status: "online" | "offline") => avFn({ data: { status } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["driver"] }), onError: (e) => toast.error(errMsg(e)) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const online = d.driver.availability_status !== "offline";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{d.driver.display_name}</h1>
          <p className="text-sm text-muted-foreground">Verification: <b>{d.driver.verification_status}</b> · {d.vehicle?.vehicle_type} {d.vehicle?.registration_ref} ({d.vehicle?.seating_capacity} seats)</p>
          {d.driver.restricted_until && new Date(d.driver.restricted_until) > new Date() && <p className="text-sm text-destructive">Temporarily restricted: {d.driver.restriction_reason}</p>}
        </div>
        <Button size="lg" variant={online ? "outline" : "accent"} disabled={av.isPending || d.driver.availability_status === "on_trip" || (!online && d.driver.verification_status !== "verified")} onClick={() => av.mutate(online ? "offline" : "online")}>
          {d.driver.availability_status === "on_trip" ? "On trip" : online ? "Go offline" : "Go online"}
        </Button>
      </div>
      {d.driver.verification_status !== "verified" && <Panel><p className="text-sm">You can go online once Operations verifies your licence and vehicle documents. (No selfie is required.)</p></Panel>}
      <DriverTripControls data={d} demo={false} onChange={() => qc.invalidateQueries({ queryKey: ["driver"] })} />
      <IncidentButton bookingId={d.assignments.find((a) => a.assignment_state === "confirmed")?.booking_id ?? null} />
      <Panel title="Payout ledger" action={<span className="text-xs text-muted-foreground">gross ≠ net earnings</span>}>
        {d.ledger.length === 0 ? <Empty>No payouts yet.</Empty> : (
          <ul className="divide-y text-sm">{d.ledger.map((l: { id: string; entry_type: string; amount_paise: number; reason: string; settlement_id: string | null }) => <li key={l.id} className="flex justify-between py-2"><span>{l.entry_type}<span className="block text-xs text-muted-foreground">{l.reason}</span></span><span className="text-right"><Money paise={l.amount_paise} /><span className="block text-xs text-muted-foreground">{l.settlement_id ? "settled" : "unsettled"}</span></span></li>)}</ul>
        )}
      </Panel>
    </div>
  );
}

function IncidentButton({ bookingId }: { bookingId: string | null }) {
  const fn = useServerFn(reportIncident);
  const [text, setText] = useState("");
  const m = useMutation({ mutationFn: () => fn({ data: { bookingId, category: "other", description: text, role: "driver" } }), onSuccess: () => { toast.success("Incident reported to the safety team"); setText(""); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Panel title="Report an incident">
      <div className="flex gap-2"><input className="flex-1 rounded-md border px-3 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe what happened" /><Button variant="outline" disabled={text.length < 5} onClick={() => m.mutate()}>Report</Button><Button asChild variant="emergency"><a href="tel:112">112</a></Button></div>
    </Panel>
  );
}
