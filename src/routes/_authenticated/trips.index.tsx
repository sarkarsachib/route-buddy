import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyBookings } from "@/lib/api/passenger.functions";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, Money, MODE_LABEL, Panel, StateBadge } from "@/components/tandem/ui";

export const Route = createFileRoute("/_authenticated/trips/")({
  head: () => ({ meta: [{ title: "My trips · Tandem" }, { name: "description", content: "Your active and past rides." }, { property: "og:title", content: "My trips · Tandem" }, { property: "og:description", content: "Your active and past rides." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TripsPage,
});

const ACTIVE = ["SEARCHING", "MATCH_PROPOSED", "MATCH_CONFIRMED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_ONBOARD", "IN_PROGRESS"];

function TripsPage() {
  const fn = useServerFn(listMyBookings);
  const q = useQuery({ queryKey: ["my-bookings"], queryFn: () => fn(), refetchInterval: 10000 });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const all = q.data ?? [];
  const active = all.filter((b: { state: string }) => ACTIVE.includes(b.state));
  const past = all.filter((b: { state: string }) => !ACTIVE.includes(b.state));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">My trips</h1><Button asChild variant="accent"><Link to="/ride">New ride</Link></Button></div>
      <Panel title="Active">{active.length ? <List items={active} /> : <Empty>No active rides.</Empty>}</Panel>
      <Panel title="History">{past.length ? <List items={past} /> : <Empty>No past rides yet.</Empty>}</Panel>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function List({ items }: { items: any[] }) {
  return (
    <ul className="divide-y">
      {items.map((b) => (
        <li key={b.id}>
          <Link to="/trips/$bookingId" params={{ bookingId: b.id }} className="flex items-center justify-between gap-3 py-3 hover:bg-secondary/50">
            <div>
              <div className="font-medium">{b.pickup_label} → {b.dropoff_label}</div>
              <div className="text-xs text-muted-foreground">{MODE_LABEL[b.ride_mode]} · {new Date(b.created_at).toLocaleString()}</div>
            </div>
            <div className="text-right"><StateBadge state={b.state} /><div className="mt-1 text-sm"><Money paise={b.final_fare ?? b.current_guaranteed_payable} /></div></div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
