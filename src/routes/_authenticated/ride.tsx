import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownUp, Info } from "lucide-react";
import { createQuote, confirmBooking } from "@/lib/api/passenger.functions";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_PLACES } from "@/lib/domain/places";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Money, Panel, Row, ErrorBox, DemoTag, MODE_LABEL, errMsg } from "@/components/tandem/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ride")({
  head: () => ({ meta: [{ title: "Book a ride · Tandem" }, { name: "description", content: "Get a transparent quote for a private or shared ride." }, { property: "og:title", content: "Book a ride · Tandem" }, { property: "og:description", content: "Transparent quotes with a hard fare ceiling." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: RidePage,
});

const MODES = [
  { id: "SHARE_AND_SAVE", d: "Guaranteed discount now; more if a co-passenger joins." },
  { id: "PRIVATE", d: "Only you. Standard disclosed fare." },
  { id: "SHARED_NOW", d: "Join an existing shared ride with a quoted fare." },
  { id: "BUDGET", d: "Set your max. Confirmed only if feasible." },
  { id: "GROUP_PRIVATE", d: "Family/group, private vehicle." },
] as const;
type Mode = (typeof MODES)[number]["id"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Quote = any;

function RidePage() {
  const nav = useNavigate();
  const [pickup, setPickup] = useState("barasat");
  const [dropoff, setDropoff] = useState("sealdah");
  const [mode, setMode] = useState<Mode>("SHARE_AND_SAVE");
  const [count, setCount] = useState(1);
  const [vehicle, setVehicle] = useState<"hatchback" | "sedan" | "suv">("hatchback");
  const [detour, setDetour] = useState(25);
  const [when, setWhen] = useState("");
  const [budget, setBudget] = useState("350");
  const [category, setCategory] = useState("none");
  const [language, setLanguage] = useState<"en" | "bn" | "hi">("en");
  const [extraBoarding, setExtraBoarding] = useState(false);
  const [pay, setPay] = useState<"cash" | "digital">("cash");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [noMatch, setNoMatch] = useState<Quote | null>(null);
  const idemKey = useMemo(() => (quote ? `bk-${quote.id}` : ""), [quote]);

  const cats = useQuery({ queryKey: ["categories"], queryFn: async () => (await supabase.from("category_rules").select("*")).data ?? [] });
  const qFn = useServerFn(createQuote);
  const cFn = useServerFn(confirmBooking);
  const place = (id: string) => DEMO_PLACES.find((p) => p.id === id)!;

  const getQuote = useMutation({
    mutationFn: () => {
      const p = place(pickup), d = place(dropoff);
      return qFn({ data: { pickup: { label: p.name, lat: p.lat, lng: p.lng }, dropoff: { label: d.name, lat: d.lat, lng: d.lng }, mode, passengerCount: count, vehicleType: vehicle, maxDetourPct: detour, budgetPaise: mode === "BUDGET" ? Math.round(Number(budget) * 100) : undefined, departAt: when ? new Date(when).toISOString() : undefined, category: category === "none" ? null : category } });
    },
    onSuccess: (r) => {
      if (r.ok) { setQuote(r.quote); setNoMatch(null); } else { setQuote(null); setNoMatch(r); }
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const confirm = useMutation({
    mutationFn: () => cFn({ data: { quoteId: quote.id, idempotencyKey: idemKey, paymentMethod: pay, maxDetourPct: detour, departAt: when ? new Date(when).toISOString() : undefined, language, accessibility: { extraBoardingTime: extraBoarding } } }),
    onSuccess: (r) => { toast.success(r.idempotentReplay ? "Booking already confirmed" : "Booking confirmed"); nav({ to: "/trips/$bookingId", params: { bookingId: r.booking.id } }); },
    // Network interruption: retrying with the same idempotency key cannot double-book.
    onError: (e) => toast.error(`${errMsg(e)} — you can safely retry; it won't double-book.`),
  });

  const shared = ["SHARE_AND_SAVE", "SHARED_NOW", "BUDGET"].includes(mode);
  const reset = () => { setQuote(null); setNoMatch(null); };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <Panel title="Where to?" action={<DemoTag>demo gazetteer</DemoTag>}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <PlaceSelect label="Pickup" value={pickup} onChange={(v) => { setPickup(v); reset(); }} />
          <Button variant="ghost" size="icon" aria-label="Swap" onClick={() => { setPickup(dropoff); setDropoff(pickup); reset(); }}><ArrowDownUp className="h-4 w-4" /></Button>
          <PlaceSelect label="Drop-off" value={dropoff} onChange={(v) => { setDropoff(v); reset(); }} />
        </div>
        <div className="mt-5">
          <Label>Ride type</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {MODES.map((m) => (
              <button key={m.id} onClick={() => { setMode(m.id); reset(); if (m.id === "GROUP_PRIVATE") setVehicle("suv"); }} className={cn("rounded-lg border p-3 text-left transition", mode === m.id ? "border-accent bg-accent/10 ring-2 ring-accent" : "hover:bg-secondary")}>
                <div className="font-semibold">{MODE_LABEL[m.id]}</div>
                <div className="text-xs text-muted-foreground">{m.d}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div><Label>Passengers</Label><Input type="number" min={1} max={shared ? 2 : 6} value={count} onChange={(e) => { setCount(Math.max(1, Number(e.target.value))); reset(); }} /></div>
          <div><Label>Vehicle</Label>
            <Select value={vehicle} onValueChange={(v) => { setVehicle(v as typeof vehicle); reset(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="hatchback">Hatchback (4)</SelectItem><SelectItem value="sedan">Sedan (4)</SelectItem><SelectItem value="suv">SUV (6)</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>When</Label><Input type="datetime-local" value={when} onChange={(e) => { setWhen(e.target.value); reset(); }} /><span className="text-xs text-muted-foreground">Empty = now</span></div>
        </div>
        {shared && (
          <div className="mt-5">
            <Label>Max extra travel for sharing: <b>{detour}%</b></Label>
            <Slider className="mt-3" min={0} max={50} step={5} value={[detour]} onValueChange={(v) => { setDetour(v[0] ?? 25); reset(); }} />
          </div>
        )}
        {mode === "BUDGET" && (
          <div className="mt-5 max-w-xs"><Label>Your max budget (₹)</Label><Input inputMode="numeric" value={budget} onChange={(e) => { setBudget(e.target.value.replace(/\D/g, "")); reset(); }} /></div>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div><Label>Ride category (this trip)</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v); reset(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standard</SelectItem>
                {(cats.data ?? []).map((c) => <SelectItem key={c.code} value={c.code} disabled={c.status !== "available"}>{c.label}{c.status !== "available" ? " — pending review" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="bn">বাংলা</SelectItem><SelectItem value="hi">हिन्दी</SelectItem></SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={extraBoarding} onChange={(e) => setExtraBoarding(e.target.checked)} /> Need extra boarding time</label>
        </div>
        <Button className="mt-6 w-full sm:w-auto" size="lg" onClick={() => getQuote.mutate()} disabled={getQuote.isPending || pickup === dropoff}>
          {getQuote.isPending ? "Calculating…" : "Get fare quote"}
        </Button>
        {pickup === dropoff && <p className="mt-2 text-xs text-destructive">Pickup and drop-off must differ.</p>}
      </Panel>

      <div className="space-y-4">
        {!quote && !noMatch && <Panel><p className="text-sm text-muted-foreground">Your fare breakdown will appear here before you confirm anything.</p></Panel>}
        {noMatch && (
          <Panel title="No feasible shared ride right now">
            <p className="text-sm text-muted-foreground">We don't force matches that break detour, fare or driver-payout limits.</p>
            <ul className="mt-2 space-y-1 text-xs">{noMatch.rejections.map((r: { tripId: string; reasons: string[] }) => <li key={r.tripId} className="font-mono">trip {r.tripId.slice(0, 6)}: {r.reasons.join(", ")}</li>)}</ul>
            <p className="mt-3 text-sm">Private fallback: <Money paise={noMatch.fallbackPrivateFare} /> — only if you choose it.</p>
            <Button className="mt-3" variant="outline" onClick={() => { setMode("PRIVATE"); setNoMatch(null); }}>Switch to Private (re-quote)</Button>
          </Panel>
        )}
        {quote && <QuoteView quote={quote} />}
        {quote && (
          <Panel>
            <Label>Payment</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => setPay("cash")} className={cn("rounded-lg border p-2 text-sm", pay === "cash" && "ring-2 ring-accent")}>Cash after ride</button>
              <button onClick={() => setPay("digital")} className={cn("rounded-lg border p-2 text-sm", pay === "digital" && "ring-2 ring-accent")}>Digital <DemoTag>sandbox</DemoTag></button>
            </div>
            <div className="mt-3 rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
              <Info className="mr-1 inline h-3 w-3" />Cancellation: free until a driver confirms. After that a disclosed fee of <Money paise={quote.calculation?.cancellation?.fee_paise ?? 0} /> applies (₹0 until legally approved). No-show grace: {Math.round((quote.calculation?.cancellation?.noshow_grace_s ?? 300) / 60)} min.
            </div>
            <Button className="mt-4 w-full" size="lg" variant="accent" onClick={() => confirm.mutate()} disabled={confirm.isPending || new Date(quote.expires_at) < new Date()}>
              {confirm.isPending ? "Confirming…" : `Confirm · pay at most ${(Number(quote.current_guaranteed_payable) / 100).toFixed(2)}`}
            </Button>
            {confirm.isError && <div className="mt-2"><ErrorBox error={confirm.error} /></div>}
          </Panel>
        )}
      </div>
    </div>
  );
}

function PlaceSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{DEMO_PLACES.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function QuoteView({ quote }: { quote: Quote }) {
  const b = quote.calculation?.breakdown;
  const shared = ["SHARE_AND_SAVE", "SHARED_NOW", "BUDGET"].includes(quote.ride_mode);
  return (
    <Panel title={`${MODE_LABEL[quote.ride_mode]} quote`} action={<span className="text-xs text-muted-foreground">expires {new Date(quote.expires_at).toLocaleTimeString()}</span>}>
      <p className="text-sm text-muted-foreground">{quote.pickup_label} → {quote.dropoff_label} · {(quote.distance_m / 1000).toFixed(1)} km · ~{Math.round(quote.duration_s / 60)} min <DemoTag>simulated route</DemoTag></p>
      <div className="mt-3 divide-y text-sm">
        <div className="pb-2">
          <Row label="Base fare" value={<Money paise={b?.base} />} />
          <Row label="Distance" value={<Money paise={b?.distance} />} />
          <Row label="Time (disclosed)" value={<Money paise={b?.time} />} />
          {b?.vehicleAdjustment ? <Row label="Vehicle class" value={<Money paise={b.vehicleAdjustment} />} /> : null}
          {b?.minFareTopUp ? <Row label="Minimum fare top-up" value={<Money paise={b.minFareTopUp} />} /> : null}
          <Row label="Tolls / fees" value={<Money paise={b?.tolls ?? 0} />} />
          <Row label="Private fare (genuine reference)" value={<Money paise={quote.private_reference_fare} />} strong />
        </div>
        <div className="pt-2">
          <Row label="Confirmed fare ceiling" hint="Hard cap — you will never pay more" value={<Money paise={quote.initial_fare_ceiling} />} />
          {Number(quote.guaranteed_discount) > 0 && <Row label={<span className="text-success">Guaranteed discount</span>} value={<span className="text-success">− <Money paise={quote.guaranteed_discount} /></span>} />}
          <Row label="Current guaranteed fare" value={<Money paise={quote.current_guaranteed_payable} className="text-lg" />} strong />
          {shared && Number(quote.potential_additional_discount) > 0 && (
            <div className="mt-2 rounded-lg bg-accent/15 p-2 text-xs">Conditional: up to <Money paise={quote.potential_additional_discount} /> more off if a compatible co-passenger joins. Not guaranteed.</div>
          )}
        </div>
      </div>
      {(quote.calculation?.amounts?.notes ?? []).map((n: string) => <p key={n} className="mt-2 text-xs text-muted-foreground">• {n}</p>)}
      <p className="mt-2 text-[11px] text-muted-foreground">Pricing {quote.pricing_version} (not business-approved)</p>
    </Panel>
  );
}
