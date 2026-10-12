import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSharedTrip } from "@/lib/api/passenger.functions";
import { Logo } from "@/components/tandem/AppShell";
import { Button } from "@/components/ui/button";
import { Loading, Panel, StateBadge } from "@/components/tandem/ui";

export const Route = createFileRoute("/share/$token")({
  head: () => ({ meta: [{ title: "Shared trip status · Tandem" }, { name: "description", content: "A trusted contact shared their ride status with you." }, { name: "robots", content: "noindex" }, { property: "og:title", content: "Shared trip status · Tandem" }, { property: "og:description", content: "Ride status shared by a trusted contact." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SharePage,
});

function SharePage() {
  const { token } = Route.useParams();
  const fn = useServerFn(getSharedTrip);
  const q = useQuery({ queryKey: ["share", token], queryFn: () => fn({ data: { token } }), refetchInterval: 15000 });
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Logo />
      {q.isLoading ? <Loading /> : !q.data ? <Panel><p>This link is invalid or has expired.</p></Panel> : (
        <Panel title="Trip shared with you">
          <StateBadge state={q.data.state} />
          <p className="mt-3 text-sm">{q.data.pickup} → {q.data.dropoff}</p>
          {q.data.driver && <p className="mt-2 text-sm text-muted-foreground">Driver: {q.data.driver.name} · {q.data.driver.vehicle} · {q.data.driver.registration}</p>}
          <p className="mt-2 text-xs text-muted-foreground">Updated {new Date(q.data.updatedAt).toLocaleString()} · live location is not shared in this build.</p>
          <Button asChild variant="emergency" className="mt-4 w-full"><a href="tel:112">Call 112 (India emergency)</a></Button>
        </Panel>
      )}
    </div>
  );
}
