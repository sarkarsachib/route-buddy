import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Users, Car, Scale, Phone, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/tandem/AppShell";
import { Money, DemoTag } from "@/components/tandem/ui";
import { t, type Lang } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tandem — Share & Save rides with a hard fare cap" },
      { name: "description", content: "Book private or shared rides along the Duttapukur–Barasat–Kolkata corridor. Your confirmed fare is a ceiling: shared co-passengers can only lower it." },
      { property: "og:title", content: "Tandem — Share & Save rides with a hard fare cap" },
      { property: "og:description", content: "Private or shared rides. Fare shown before you confirm, never more than your ceiling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [lang, setLang] = useState<Lang>("en");
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-hero text-hero-foreground">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Logo light />
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-hero-muted" aria-hidden />
            {(["en", "bn", "hi"] as Lang[]).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={`rounded px-1.5 py-0.5 text-xs font-medium ${lang === l ? "bg-accent text-accent-foreground" : "text-hero-muted"}`}>{{ en: "EN", bn: "বাং", hi: "हिं" }[l]}</button>
            ))}
            <Button asChild size="sm" variant="heroOutline" className="ml-2"><Link to="/auth" search={{}}>Sign in</Link></Button>
          </div>
        </header>
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-8 md:grid-cols-[1.2fr_1fr] md:pt-14">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent">Duttapukur · Barasat · Madhyamgram · Kolkata <DemoTag>pilot unvalidated</DemoTag></p>
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-6xl">{t("tagline", lang)}</h1>
            <p className="mt-5 max-w-xl text-lg text-hero-muted">Book a private ride, or Share & Save: we find compatible co-passengers going your way. Your confirmed fare is a hard ceiling — matches can only bring it down.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent"><Link to="/ride">{t("book", lang)}</Link></Button>
              <Button asChild size="lg" variant="heroOutline"><a href="#how">How fares work</a></Button>
            </div>
          </div>
          <FareCard />
        </section>
      </div>

      <section id="how" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold">Two ways to ride</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6">
            <Car className="h-6 w-6 text-primary" />
            <h3 className="mt-3 text-xl font-bold">Private Ride</h3>
            <p className="mt-2 text-muted-foreground">Just you (or your group). The fare is calculated from a disclosed base, distance and time — and shown before you confirm. This private fare is the genuine reference we compare all savings against.</p>
          </div>
          <div className="rounded-2xl border-2 border-accent bg-card p-6">
            <Users className="h-6 w-6 text-accent-foreground" />
            <h3 className="mt-3 text-xl font-bold">Share & Save</h3>
            <p className="mt-2 text-muted-foreground">You get a guaranteed discount the moment you book. If a compatible co-passenger joins within your detour limit, your fare drops further. Once a lower fare is guaranteed, it never goes back up — even if they cancel.</p>
          </div>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {[
            { i: Scale, t: "Fair to drivers", d: "Shared trips target at least 105% of a comparable private payout for the same route. If the numbers don't work, we don't force the match." },
            { i: ShieldCheck, t: "Safety first", d: "Document-verified drivers and vehicles. Share your trip with a trusted contact. Report incidents to a human safety team." },
            { i: Phone, t: "Emergency: 112", d: "One-tap call to India's emergency number from every active trip." },
          ].map((x) => (
            <div key={x.t} className="rounded-xl bg-secondary p-5">
              <x.i className="h-5 w-5 text-primary" />
              <h3 className="mt-2 font-bold">{x.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{x.d}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        Tandem is a placeholder codename. Demo build: routing is simulated, payments are sandbox-only, drivers are seeded demo data. Not a licensed transport service; legal review pending.
      </footer>
    </div>
  );
}

function FareCard() {
  return (
    <div className="self-center rounded-2xl bg-card p-5 text-card-foreground shadow-2xl">
      <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Barasat → Sealdah · Share & Save</span><DemoTag>example</DemoTag></div>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Private fare (reference)</span><Money paise={49127} /></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Confirmed fare ceiling</span><Money paise={49127} /></div>
        <div className="flex justify-between text-success"><span>Guaranteed discount</span><span>− <Money paise={3930} /></span></div>
        <div className="flex justify-between border-t pt-2 text-base font-bold"><span>You pay at most</span><Money paise={45197} /></div>
        <div className="flex justify-between rounded-lg bg-accent/20 px-2 py-1.5 text-xs"><span>Possible extra saving if matched</span><span>up to <Money paise={15721} /></span></div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Illustrative numbers from the demo pricing version (not business-approved).</p>
    </div>
  );
}
