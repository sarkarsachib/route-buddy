import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Share2 } from "lucide-react";
import { cancelBooking, createShareLink, getBookingDetail, makeOffer, openSupportCase, reportIncident, requestRefund, respondOffer, retrySearch } from "@/lib/api/passenger.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DemoTag, ErrorBox, Loading, Money, MODE_LABEL, Panel, Row, RouteStrip, StateBadge, errMsg } from "@/components/tandem/ui";

export const Route = createFileRoute("/_authenticated/trips/$bookingId")({
  head: () => ({ meta: [{ title: "Trip status · Tandem" }, { name: "description", content: "Track your ride, fare and safety options." }, { property: "og:title", content: "Trip status · Tandem" }, { property: "og:description", content: "Track your ride." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TripDetail,
});

const STEPS = ["SEARCHING", "MATCH_PROPOSED", "MATCH_CONFIRMED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_ONBOARD", "IN_PROGRESS", "COMPLETED"];

function TripDetail() {
  const { bookingId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getBookingDetail);
  const q = useQuery({ queryKey: ["booking", bookingId], queryFn: () => fn({ data: { bookingId } }), refetchInterval: 6000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["booking", bookingId] });
  const cancelFn = useServerFn(cancelBooking);
  const shareFn = useServerFn(createShareLink);
  const retryFn = useServerFn(retrySearch);
  const cancel = useMutation({ mutationFn: (reason: string) => cancelFn({ data: { bookingId, reason } }), onSuccess: (r) => { toast.success(`Cancelled. ${r.note}`); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const share = useMutation({
    mutationFn: () => shareFn({ data: { bookingId } }),
    onSuccess: async (r) => {
      const url = `${window.location.origin}/share/${r.token}`;
      if (navigator.share) await navigator.share({ title: "My ride status", url }).catch(() => {});
      else { await navigator.clipboard.writeText(url); toast.success("Link copied — send it to your trusted contact"); }
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const retry = useMutation({ mutationFn: () => retryFn({ data: { bookingId } }), onSuccess: (r) => { toast(r.status === "proposed" ? "Driver offer sent" : "Still no feasible match"); refresh(); } });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const b = d.booking;
  const active = !["COMPLETED", "CANCELLED", "EXPIRED"].includes(b.state);
  const idx = STEPS.indexOf(b.state);
  const saved = Number(b.private_reference_fare) - Number(b.final_fare ?? b.current_guaranteed_payable);

  return (
    <div className="space-y-4">
      <Link to="/trips" className="text-sm text-muted-foreground">← My trips</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{b.pickup_label} → {b.dropoff_label}</h1>
          <p className="text-sm text-muted-foreground">{MODE_LABEL[b.ride_mode]} · {b.passenger_count} seat(s) · max detour {b.max_detour_pct}%</p>
        </div>
        <StateBadge state={b.state} />
      </div>

      {active && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="emergency"><a href="tel:112"><Phone className="mr-1 h-4 w-4" />Emergency 112</a></Button>
          <Button variant="outline" onClick={() => share.mutate()}><Share2 className="mr-1 h-4 w-4" />Share trip with trusted contact</Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Panel title="Progress">
            <ol className="grid grid-cols-4 gap-1 sm:grid-cols-8">
              {STEPS.map((s, i) => <li key={s} className={`h-1.5 rounded-full ${i <= idx ? "bg-accent" : "bg-muted"}`} title={s} />)}
            </ol>
            {b.state === "SEARCHING" && (
              <div className="mt-3 text-sm">
                <p>Looking for a feasible driver/match. We never relax your fare, detour or safety limits to force one.</p>
                <Button className="mt-2" size="sm" variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>Search again now</Button>
              </div>
            )}
            {b.state === "MATCH_PROPOSED" && <p className="mt-3 text-sm">Offer sent to a driver{d.assignment?.expiresAt ? `, expires ${new Date(d.assignment.expiresAt).toLocaleTimeString()}` : ""}. If they decline, we keep searching.</p>}
            {d.driver && (
              <div className="mt-4 rounded-lg bg-secondary p-3 text-sm">
                <div className="font-semibold">{d.driver.name} {d.driver.isDemo && <DemoTag />}</div>
                <div className="text-muted-foreground">{d.driver.vehicle} · {d.driver.registration} · ★ {d.driver.rating ?? "new"}</div>
                {d.coPassengers > 0 && <div className="mt-1 text-xs">Sharing with {d.coPassengers} verified-account co-passenger(s). Their details stay private.</div>}
              </div>
            )}
            {d.stops.length > 0 && <div className="mt-4"><RouteStrip stops={d.stops} /></div>}
          </Panel>
          {b.ride_mode === "BUDGET" && b.state === "SEARCHING" && <Negotiation booking={b} offers={d.offers ?? []} onDone={refresh} />}
          <Panel title="Timeline">
            <ul className="space-y-1 text-xs">
              {(d.events ?? []).map((e: { id: string; to_state: string; actor_role: string; reason: string | null; created_at: string }) => (
                <li key={e.id} className="flex gap-2"><span className="w-20 shrink-0 text-muted-foreground">{new Date(e.created_at).toLocaleTimeString()}</span><span className="font-mono">{e.to_state}</span><span className="text-muted-foreground">by {e.actor_role}{e.reason ? ` — ${e.reason}` : ""}</span></li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Your fare">
            <Row label="Private fare (reference)" value={<Money paise={b.private_reference_fare} />} />
            <Row label="Confirmed ceiling" value={<Money paise={b.confirmed_fare_ceiling} />} />
            <Row label="Current guaranteed fare" value={<Money paise={b.current_guaranteed_payable} />} strong />
            {b.final_fare != null && <Row label="Final fare charged" value={<Money paise={b.final_fare} />} strong />}
            {saved > 0 && <p className="mt-2 rounded bg-success/10 p-2 text-sm text-success">Saving <Money paise={saved} /> vs the genuine private fare.</p>}
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Fare history (immutable)</summary>
              <ul className="mt-2 space-y-1">{(d.allocations ?? []).map((a: { id: string; allocation_method: string; guaranteed_amount: number; final_amount: number | null; created_at: string }) => <li key={a.id} className="flex justify-between"><span>{a.allocation_method}</span><Money paise={a.final_amount ?? a.guaranteed_amount} /></li>)}</ul>
            </details>
            <div className="mt-3 text-xs text-muted-foreground">Payment: {b.payment_method}{(d.payments ?? []).map((p: { id: string; status: string; provider: string }) => <span key={p.id}> · {p.provider} {p.status}</span>)}</div>
          </Panel>
          <Panel title="Help">
            <div className="flex flex-col gap-2">
              {active && <CancelDialog onCancel={(r) => cancel.mutate(r)} pending={cancel.isPending} />}
              <IssueDialog bookingId={bookingId} />
              <IncidentDialog bookingId={bookingId} />
              {b.state === "COMPLETED" && <RefundDialog bookingId={bookingId} max={Number(b.final_fare)} />}
            </div>
            {(d.refunds ?? []).map((r: { id: string; amount_paise: number; status: string }) => <p key={r.id} className="mt-2 text-xs">Refund <Money paise={r.amount_paise} />: {r.status}</p>)}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function CancelDialog({ onCancel, pending }: { onCancel: (r: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("Plans changed");
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Cancel ride</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel this ride?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Free before a driver confirms; after that the disclosed fee applies (currently ₹0, pending legal review). Co-passengers' fares will not increase.</p>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <Button variant="destructive" disabled={pending || !reason} onClick={() => onCancel(reason)}>Confirm cancellation</Button>
      </DialogContent>
    </Dialog>
  );
}

function IssueDialog({ bookingId }: { bookingId: string }) {
  const fn = useServerFn(openSupportCase);
  const [cat, setCat] = useState<"fare" | "driver" | "lost_item" | "app" | "other">("fare");
  const [text, setText] = useState("");
  const m = useMutation({ mutationFn: () => fn({ data: { bookingId, category: cat, description: text } }), onSuccess: () => { toast.success("Support case opened"); setText(""); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Report an issue</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Report an issue</DialogTitle></DialogHeader>
        <Select value={cat} onValueChange={(v) => setCat(v as typeof cat)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["fare", "driver", "lost_item", "app", "other"].map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened?" maxLength={4000} />
        <Button disabled={text.length < 5 || m.isPending} onClick={() => m.mutate()}>Submit</Button>
      </DialogContent>
    </Dialog>
  );
}

function IncidentDialog({ bookingId }: { bookingId: string }) {
  const fn = useServerFn(reportIncident);
  const [cat, setCat] = useState<"physical_safety" | "harassment" | "accident" | "route_deviation" | "vehicle_condition" | "other">("route_deviation");
  const [text, setText] = useState("");
  const m = useMutation({ mutationFn: () => fn({ data: { bookingId, category: cat, description: text, role: "passenger" } }), onSuccess: (r) => { toast.success(r.urgent ? "Reported. Marked urgent for the safety team. If you are in danger, call 112 now." : "Reported to the safety team."); setText(""); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" className="border-destructive/40 text-destructive">Report a safety incident</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Safety report</DialogTitle></DialogHeader>
        <p className="text-sm">In immediate danger? <a className="font-bold text-destructive underline" href="tel:112">Call 112</a>.</p>
        <Select value={cat} onValueChange={(v) => setCat(v as typeof cat)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["physical_safety", "harassment", "accident", "route_deviation", "vehicle_condition", "other"].map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe what you observed" maxLength={4000} />
        <p className="text-xs text-muted-foreground">Reviewed by trained humans with restricted access. Evidence upload is not yet available in this build.</p>
        <Button variant="destructive" disabled={text.length < 5 || m.isPending} onClick={() => m.mutate()}>Submit report</Button>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ bookingId, max }: { bookingId: string; max: number }) {
  const fn = useServerFn(requestRefund);
  const [amt, setAmt] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation({ mutationFn: () => fn({ data: { bookingId, amountPaise: Math.round(Number(amt) * 100), reason } }), onSuccess: () => toast.success("Refund requested — an operator will review it"), onError: (e) => toast.error(errMsg(e)) });
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Request refund</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request a refund</DialogTitle></DialogHeader>
        <Input inputMode="decimal" placeholder={`Amount in ₹ (max ${(max / 100).toFixed(2)})`} value={amt} onChange={(e) => setAmt(e.target.value)} />
        <Textarea placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button disabled={!amt || reason.length < 3 || m.isPending} onClick={() => m.mutate()}>Submit</Button>
      </DialogContent>
    </Dialog>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Negotiation({ booking, offers, onDone }: { booking: any; offers: any[]; onDone: () => void }) {
  const offerFn = useServerFn(makeOffer);
  const respFn = useServerFn(respondOffer);
  const [amt, setAmt] = useState(String(Math.round(Number(booking.current_guaranteed_payable) / 100)));
  const send = useMutation({ mutationFn: () => offerFn({ data: { bookingId: booking.id, amountPaise: Math.round(Number(amt) * 100) } }), onSuccess: () => { toast.success("Offer sent to the nearest eligible driver"); onDone(); }, onError: (e) => toast.error(errMsg(e)) });
  const respond = useMutation({ mutationFn: (v: { offerId: string; response: "accept" | "reject" }) => respFn({ data: v }), onSuccess: () => { toast.success("Done"); onDone(); }, onError: (e) => toast.error(errMsg(e)) });
  const open = offers.filter((o) => o.status === "open");
  return (
    <Panel title="Negotiate your budget ride">
      <p className="text-sm text-muted-foreground">Offers must stay within your ceiling (<Money paise={booking.confirmed_fare_ceiling} />) and the disclosed driver floor (85% of the private fare). Offers expire.</p>
      <div className="mt-3 flex gap-2"><Input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ""))} className="max-w-32" /><Button onClick={() => send.mutate()} disabled={send.isPending}>Send offer</Button></div>
      <ul className="mt-3 space-y-2 text-sm">
        {offers.map((o) => (
          <li key={o.id} className="flex items-center justify-between rounded border p-2">
            <span>{o.party === "driver" ? "Driver counter" : "Your offer"}: <Money paise={o.amount_paise} /> · {o.status}{o.status === "open" ? ` · until ${new Date(o.expires_at).toLocaleTimeString()}` : ""}</span>
            {o.status === "open" && o.party === "driver" && open.length > 0 && (
              <span className="flex gap-1"><Button size="sm" onClick={() => respond.mutate({ offerId: o.id, response: "accept" })}>Accept</Button><Button size="sm" variant="outline" onClick={() => respond.mutate({ offerId: o.id, response: "reject" })}>Decline</Button></span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
