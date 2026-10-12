import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { claimDemoRole } from "@/lib/api/passenger.functions";
import { useMe } from "@/components/tandem/AppShell";
import { Button } from "@/components/ui/button";
import { DemoTag, Loading, Panel, errMsg } from "@/components/tandem/ui";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account · Tandem" }, { name: "description", content: "Your profile and roles." }, { property: "og:title", content: "Account · Tandem" }, { property: "og:description", content: "Your profile and roles." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Account,
});

const ROLES = [
  { r: "driver", d: "Driver dashboard (creates an unverified test driver profile; Operations must verify it)." },
  { r: "ops_agent", d: "Bookings, drivers, support, refunds, demo-driver simulation." },
  { r: "safety_reviewer", d: "Incident review with restricted access." },
  { r: "finance", d: "Ledgers, reconciliation, settlements." },
  { r: "admin", d: "Pricing versions, roles, audit log." },
] as const;

function Account() {
  const me = useMe();
  const qc = useQueryClient();
  const fn = useServerFn(claimDemoRole);
  const m = useMutation({ mutationFn: (role: (typeof ROLES)[number]["r"]) => fn({ data: { role } }), onSuccess: () => { toast.success("Role granted (demo)"); qc.invalidateQueries(); }, onError: (e) => toast.error(errMsg(e)) });
  if (me.isLoading) return <Loading />;
  const roles = me.data?.roles ?? [];
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Account</h1>
      <Panel title="Profile">
        <p className="text-sm">{me.data?.profile?.display_name}</p>
        <p className="mt-1 text-xs text-muted-foreground">Roles: {roles.join(", ")}</p>
      </Panel>
      {me.data?.demoMode && (
        <Panel title={<span>Try other roles <DemoTag /></span>}>
          <p className="text-sm text-muted-foreground">Demo mode only. Roles are granted server-side, stored in a protected roles table and audited — this is not a client-side switch. This capability must be disabled before any launch.</p>
          <ul className="mt-3 space-y-2">
            {ROLES.map((x) => (
              <li key={x.r} className="flex items-center justify-between gap-3 rounded border p-2 text-sm">
                <span><b>{x.r}</b><span className="block text-xs text-muted-foreground">{x.d}</span></span>
                <Button size="sm" variant={roles.includes(x.r) ? "secondary" : "default"} disabled={roles.includes(x.r) || m.isPending} onClick={() => m.mutate(x.r)}>{roles.includes(x.r) ? "Granted" : "Grant"}</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
