import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { actOnIncident, createSettlement, decideRefund, getAdminConfig, getIncidents, getOverview, getReconciliation, grantRole, publishPricing, setDriverVerification, simulatePayment, updateSupportCase } from "@/lib/api/ops.functions";
import { demoDriverDashboard } from "@/lib/api/driver.functions";
import { useMe } from "@/components/tandem/AppShell";
import { DriverTripControls } from "@/components/tandem/DriverTripControls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DemoTag, Empty, ErrorBox, Loading, Money, MODE_LABEL, Panel, StateBadge, errMsg } from "@/components/tandem/ui";

export const Route = createFileRoute("/_authenticated/ops")({
  head: () => ({ meta: [{ title: "Operations · Tandem" }, { name: "description", content: "Bookings, drivers, ledger, safety and configuration." }, { property: "og:title", content: "Operations · Tandem" }, { property: "og:description", content: "Operations dashboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Ops,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Ops() {
  const me = useMe();
  const roles = me.data?.roles ?? [];
  const has = (...r: string[]) => roles.some((x) => r.includes(x));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Operations</h1>
      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {has("ops_agent", "admin") && <TabsTrigger value="drivers">Drivers & demo sim</TabsTrigger>}
          {has("finance", "admin") && <TabsTrigger value="finance">Ledger & settlement</TabsTrigger>}
          {has("safety_reviewer", "admin") && <TabsTrigger value="safety">Safety</TabsTrigger>}
          {has("admin") && <TabsTrigger value="admin">Config & audit</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview"><Overview /></TabsContent>
        <TabsContent value="drivers"><Drivers /></TabsContent>
        <TabsContent value="finance"><Finance /></TabsContent>
        <TabsContent value="safety"><Safety /></TabsContent>
        <TabsContent value="admin"><Admin /></TabsContent>
      </Tabs>
    </div>
  );
}

function useOverview() {
  const fn = useServerFn(getOverview);
  return useQuery({ queryKey: ["ops-overview"], queryFn: () => fn(), refetchInterval: 10000 });
}

function Overview() {
  const q = useOverview();
  const qc = useQueryClient();
  const refundFn = useServerFn(decideRefund);
  const supFn = useServerFn(updateSupportCase);
  const payFn = useServerFn(simulatePayment);
  const run = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: (r) => { toast.success(typeof r === "object" && r && "outcome" in r ? `Webhook: ${(r as Any).outcome}` : "Done"); qc.invalidateQueries(); }, onError: (e) => toast.error(errMsg(e)) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { metrics: m, bookings, refunds, support } = q.data!;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Request→match", pct(m.requestToMatchRate)], ["Completed", m.completed], ["Cancellations", m.cancellations], ["Open incidents", m.openIncidents],
          ["Passenger savings vs genuine private", <Money key="s" paise={m.passengerSavingsVsGenuinePrivatePaise} />], ["Gross fares", <Money key="g" paise={m.grossFaresPaise} />],
          ["Driver gross payout", <Money key="d" paise={m.driverGrossPayoutPaise} />], ["Platform contribution", <Money key="p" paise={m.platformContributionPaise} />],
          ["Reserve-funded top-ups", <Money key="r" paise={m.reserveFundedPaise} />], ["Avg payout / trip", <Money key="a" paise={m.avgDriverPayoutPerTripPaise} />], ["Refunds (simulated)", <Money key="f" paise={m.refundsPaise} />],
        ].map(([k, v]) => <div key={String(k)} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="mt-1 text-lg font-bold">{v}</div></div>)}
      </div>
      <p className="text-xs text-muted-foreground">Not yet measurable in this build: {m.notYetMeasurable.join(", ")}.</p>
      <Panel title="Bookings">
        {bookings.length === 0 ? <Empty>No bookings.</Empty> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Route</th><th>Mode</th><th>State</th><th>Ceiling</th><th>Guaranteed</th><th>Final</th><th /></tr></thead>
            <tbody>{bookings.map((b: Any) => (
              <tr key={b.id} className="border-t">
                <td className="py-2"><Link to="/trips/$bookingId" params={{ bookingId: b.id }} className="underline">{b.pickup_label} → {b.dropoff_label}</Link> {b.is_demo && <DemoTag />}</td>
                <td>{MODE_LABEL[b.ride_mode]}</td><td><StateBadge state={b.state} /></td>
                <td><Money paise={b.confirmed_fare_ceiling} /></td><td><Money paise={b.current_guaranteed_payable} /></td><td><Money paise={b.final_fare} /></td>
                <td>{b.state === "COMPLETED" && b.payment_method === "digital" && <Button size="sm" variant="outline" onClick={() => run.mutate(() => payFn({ data: { bookingId: b.id } }))}>Sandbox webhook</Button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Refund requests">
          {refunds.length === 0 ? <Empty>None.</Empty> : refunds.map((r: Any) => (
            <div key={r.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
              <span><Money paise={r.amount_paise} /> · {r.reason} · <b>{r.status}</b></span>
              {r.status === "requested" && <span className="flex gap-1"><Button size="sm" onClick={() => run.mutate(() => refundFn({ data: { refundId: r.id, approve: true } }))}>Approve</Button><Button size="sm" variant="outline" onClick={() => run.mutate(() => refundFn({ data: { refundId: r.id, approve: false } }))}>Reject</Button></span>}
            </div>))}
        </Panel>
        <Panel title="Support cases">
          {support.length === 0 ? <Empty>None.</Empty> : support.map((s: Any) => (
            <div key={s.id} className="border-b py-2 text-sm last:border-0">
              <div className="flex justify-between"><b>{s.category}</b><span>{s.status}</span></div>
              <p className="text-xs text-muted-foreground">{s.description}</p>
              {s.status !== "resolved" && <div className="mt-1 flex gap-1"><Button size="sm" variant="outline" onClick={() => run.mutate(() => supFn({ data: { id: s.id, status: "in_progress" } }))}>Take</Button><Button size="sm" onClick={() => run.mutate(() => supFn({ data: { id: s.id, status: "resolved" } }))}>Resolve</Button></div>}
            </div>))}
        </Panel>
      </div>
    </div>
  );
}

function Drivers() {
  const q = useOverview();
  const qc = useQueryClient();
  const vFn = useServerFn(setDriverVerification);
  const [sim, setSim] = useState<string | null>(null);
  const v = useMutation({ mutationFn: (a: { driverId: string; status: "verified" | "rejected" }) => vFn({ data: { ...a, notes: "manual review (demo)" } }), onSuccess: () => { toast.success("Verification updated"); qc.invalidateQueries(); }, onError: (e) => toast.error(errMsg(e)) });
  if (q.isLoading) return <Loading />;
  return (
    <div className="space-y-4">
      <Panel title="Drivers">
        <ul className="divide-y text-sm">{(q.data?.drivers ?? []).map((d: Any) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{d.display_name} {d.is_demo && <DemoTag />}<span className="block text-xs text-muted-foreground">{d.verification_status} · {d.availability_status}{d.restricted_until && new Date(d.restricted_until) > new Date() ? " · RESTRICTED" : ""}</span></span>
            <span className="flex gap-1">
              {d.verification_status !== "verified" && <Button size="sm" onClick={() => v.mutate({ driverId: d.id, status: "verified" })}>Verify docs</Button>}
              {d.verification_status !== "rejected" && !d.is_demo && <Button size="sm" variant="outline" onClick={() => v.mutate({ driverId: d.id, status: "rejected" })}>Reject</Button>}
              {d.is_demo && <Button size="sm" variant={sim === d.id ? "accent" : "secondary"} onClick={() => setSim(sim === d.id ? null : d.id)}>Simulate</Button>}
            </span>
          </li>))}</ul>
      </Panel>
      {sim && <DemoSim driverId={sim} />}
    </div>
  );
}

function DemoSim({ driverId }: { driverId: string }) {
  const fn = useServerFn(demoDriverDashboard);
  const q = useQuery({ queryKey: ["demo-driver", driverId], queryFn: () => fn({ data: { driverId } }), refetchInterval: 6000 });
  const qc = useQueryClient();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <div className="space-y-2 rounded-xl border-2 border-dashed border-warning p-3">
      <p className="text-sm"><DemoTag>simulation</DemoTag> Acting for seeded demo driver <b>{q.data!.driver.display_name}</b>. Every action is recorded as a system/demo action.</p>
      <DriverTripControls data={q.data} demo onChange={() => qc.invalidateQueries()} />
    </div>
  );
}

function Finance() {
  const fn = useServerFn(getReconciliation);
  const q = useQuery({ queryKey: ["recon"], queryFn: () => fn() });
  const ov = useOverview();
  const qc = useQueryClient();
  const sFn = useServerFn(createSettlement);
  const s = useMutation({ mutationFn: (driverId: string) => sFn({ data: { driverId } }), onSuccess: () => { toast.success("Settlement drafted (no money moved)"); qc.invalidateQueries(); }, onError: (e) => toast.error(errMsg(e)) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <div className="space-y-4">
      <Panel title="Driver reconciliation (unsettled)">
        {q.data!.rows.length === 0 ? <Empty>Nothing unsettled.</Empty> : q.data!.rows.map((r: Any) => (
          <div key={r.driverId} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
            <span>{r.name}<span className="block text-xs text-muted-foreground">gross <Money paise={r.gross} /> − cash held <Money paise={r.cash} /></span></span>
            <span className="flex items-center gap-2"><b>net <Money paise={r.netDue} /></b><Button size="sm" onClick={() => s.mutate(r.driverId)}>Draft settlement</Button></span>
          </div>))}
        <p className="mt-2 text-xs text-muted-foreground">Negative net = driver owes platform commission from cash collected. Payout execution is blocked until a payout provider and legal fund flow are approved.</p>
      </Panel>
      <Panel title="Passenger fare ledger (append-only)">
        <ul className="max-h-80 divide-y overflow-y-auto text-xs">{(ov.data?.ledger ?? []).map((l: Any) => <li key={l.id} className="flex justify-between py-1.5"><span>{l.entry_type} · {l.reason}</span><Money paise={l.amount_paise} /></li>)}</ul>
      </Panel>
      <Panel title="Settlements">{(q.data!.settlements ?? []).length === 0 ? <Empty>None yet.</Empty> : q.data!.settlements.map((x: Any) => <div key={x.id} className="text-sm">{new Date(x.created_at).toLocaleString()} · net <Money paise={x.net_due} /> · {x.status}</div>)}</Panel>
    </div>
  );
}

function Safety() {
  const fn = useServerFn(getIncidents);
  const q = useQuery({ queryKey: ["incidents"], queryFn: () => fn() });
  const qc = useQueryClient();
  const aFn = useServerFn(actOnIncident);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const act = useMutation({ mutationFn: (v: Any) => aFn({ data: v }), onSuccess: () => { toast.success("Recorded"); qc.invalidateQueries({ queryKey: ["incidents"] }); }, onError: (e) => toast.error(errMsg(e)) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <Panel title="Incidents" action={<span className="text-xs text-muted-foreground">Access is audited</span>}>
      <p className="mb-3 text-xs text-muted-foreground">Prioritisation uses only the reported category. No inference about character or appearance is made; humans decide every action.</p>
      {(q.data ?? []).length === 0 ? <Empty>No incidents reported.</Empty> : (q.data ?? []).map((i: Any) => (
        <div key={i.id} className="mb-3 rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><b>{i.category.replace("_", " ")}</b><span className="text-xs">severity <b>{i.severity}</b> · {i.status}</span></div>
          <p className="mt-1">{i.description}</p>
          <ul className="mt-2 text-xs text-muted-foreground">{(i.incident_actions ?? []).map((a: Any) => <li key={a.id}>{new Date(a.created_at).toLocaleString()} · {a.action}{a.notes ? ` — ${a.notes}` : ""}</li>)}</ul>
          <Input className="mt-2" placeholder="Decision notes (required)" value={notes[i.id] ?? ""} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} />
          <div className="mt-2 flex flex-wrap gap-1">
            {(["low", "medium", "high", "critical"] as const).map((s) => <Button key={s} size="sm" variant="outline" disabled={(notes[i.id] ?? "").length < 3} onClick={() => act.mutate({ id: i.id, action: "triage", severity: s, notes: notes[i.id] })}>Triage {s}</Button>)}
            <Button size="sm" variant="destructive" disabled={(notes[i.id] ?? "").length < 3} onClick={() => act.mutate({ id: i.id, action: "escalate", notes: notes[i.id] })}>Escalate (call 112 / authorities)</Button>
            <Button size="sm" variant="secondary" disabled={(notes[i.id] ?? "").length < 3 || !i.subject_driver_id} onClick={() => act.mutate({ id: i.id, action: "interim_restrict", restrictHours: 24, notes: notes[i.id] })}>Interim 24h driver restriction</Button>
            <Button size="sm" variant="outline" disabled={(notes[i.id] ?? "").length < 3} onClick={() => act.mutate({ id: i.id, action: "appeal", notes: notes[i.id] })}>Record appeal</Button>
            <Button size="sm" disabled={(notes[i.id] ?? "").length < 3} onClick={() => act.mutate({ id: i.id, action: "resolve", notes: notes[i.id] })}>Resolve</Button>
          </div>
        </div>))}
    </Panel>
  );
}

const EDITABLE = ["base_fare_paise", "per_km_paise", "per_min_paise", "min_fare_paise", "platform_commission_bps", "share_guaranteed_discount_bps", "share_potential_max_discount_bps", "driver_shared_payout_multiplier_bps", "cancellation_fee_paise", "noshow_grace_s"];

function Admin() {
  const fn = useServerFn(getAdminConfig);
  const q = useQuery({ queryKey: ["admin-config"], queryFn: () => fn() });
  const qc = useQueryClient();
  const pubFn = useServerFn(publishPricing);
  const roleFn = useServerFn(grantRole);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [ver, setVer] = useState("");
  const [uid, setUid] = useState("");
  const [role, setRole] = useState("ops_agent");
  const run = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: () => { toast.success("Saved & audited"); qc.invalidateQueries(); }, onError: (e) => toast.error(errMsg(e)) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const active = d.pricingVersions?.find((p: Any) => p.status === "active");
  return (
    <div className="space-y-4">
      <Panel title={`Pricing — active ${active?.version ?? "?"}`} action={<DemoTag>not business-approved</DemoTag>}>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {EDITABLE.map((k) => <label key={k} className="text-xs">{k}<Input placeholder={String(active?.config?.[k])} value={changes[k] ?? ""} onChange={(e) => setChanges({ ...changes, [k]: e.target.value.replace(/\D/g, "") })} /></label>)}
        </div>
        <div className="mt-3 flex gap-2"><Input placeholder="new version id e.g. v2-demo" value={ver} onChange={(e) => setVer(e.target.value)} className="max-w-60" />
          <Button disabled={!ver} onClick={() => run.mutate(() => pubFn({ data: { version: ver, changes: Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) } }))}>Publish new version</Button></div>
        <p className="mt-2 text-xs text-muted-foreground">Versions are immutable. Existing quotes and bookings keep the version they were priced with.</p>
        <ul className="mt-2 text-xs">{d.pricingVersions?.map((p: Any) => <li key={p.id}>{p.version} · {p.status} · {new Date(p.created_at).toLocaleString()}</li>)}</ul>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Ride categories">{d.categories?.map((c: Any) => <div key={c.code} className="border-b py-1.5 text-sm last:border-0"><b>{c.label}</b> · {c.status}<p className="text-xs text-muted-foreground">{c.description}</p></div>)}
          <p className="mt-2 text-xs text-muted-foreground">Enabling a category requires legal/operational approval and is intentionally not exposed as a toggle.</p></Panel>
        <Panel title="Service areas">{d.areas?.map((a: Any) => <p key={a.id} className="text-sm">{a.name} · <b>{a.status}</b></p>)}</Panel>
      </div>
      <Panel title="Roles">
        <div className="flex flex-wrap gap-2"><Input placeholder="user id (uuid)" value={uid} onChange={(e) => setUid(e.target.value)} className="max-w-80" />
          <select className="rounded-md border px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>{["passenger", "driver", "ops_agent", "safety_reviewer", "finance", "admin"].map((r) => <option key={r}>{r}</option>)}</select>
          <Button disabled={!uid} onClick={() => run.mutate(() => roleFn({ data: { userId: uid, role: role as Any, revoke: false } }))}>Grant</Button>
          <Button variant="outline" disabled={!uid} onClick={() => run.mutate(() => roleFn({ data: { userId: uid, role: role as Any, revoke: true } }))}>Revoke</Button></div>
        <ul className="mt-2 max-h-40 overflow-y-auto text-xs font-mono">{d.roles?.map((r: Any) => <li key={r.user_id + r.role}>{r.user_id} · {r.role}</li>)}</ul>
      </Panel>
      <Panel title="Audit log (append-only)">
        <ul className="max-h-96 divide-y overflow-y-auto text-xs">{d.audit?.map((a: Any) => <li key={a.id} className="py-1.5"><span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span> · <b>{a.action}</b> · {a.entity_type} {a.entity_id?.slice(0, 8)} <span className="text-muted-foreground">{JSON.stringify(a.details).slice(0, 120)}</span></li>)}</ul>
      </Panel>
    </div>
  );
}
