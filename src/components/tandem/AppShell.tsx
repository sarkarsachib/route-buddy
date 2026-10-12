import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { Bell, LogOut } from "lucide-react";
import { getMe, myNotifications } from "@/lib/api/passenger.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function useMe() {
  const fn = useServerFn(getMe);
  return useQuery({ queryKey: ["me"], queryFn: () => fn() });
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className={`font-display text-xl font-extrabold tracking-tight ${light ? "text-hero-foreground" : "text-primary"}`}>
      tandem<span className="text-accent">.</span>
      <span className={`ml-1 align-middle font-mono text-[9px] font-medium uppercase ${light ? "text-hero-muted" : "text-muted-foreground"}`}>codename</span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const nav = useNavigate();
  const roles = me.data?.roles ?? [];
  const notifFn = useServerFn(myNotifications);
  const notifs = useQuery({ queryKey: ["notifications"], queryFn: () => notifFn(), refetchInterval: 15000 });
  const links = [
    { to: "/ride", label: "Book", show: true },
    { to: "/trips", label: "My trips", show: true },
    { to: "/driver", label: "Driver", show: roles.includes("driver") },
    { to: "/ops", label: "Operations", show: roles.some((r) => ["ops_agent", "admin", "finance", "safety_reviewer"].includes(r)) },
    { to: "/account", label: "Account", show: true },
  ] as const;
  return (
    <div className="min-h-screen bg-background">
      {me.data?.demoMode && (
        <div className="bg-warning px-4 py-1 text-center text-xs font-medium text-warning-foreground">
          DEMO MODE · simulated routing, sandbox payments, demo drivers · not a live transport service
        </div>
      )}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link to="/"><Logo /></Link>
          <nav className="ml-2 flex flex-1 gap-1 overflow-x-auto text-sm">
            {links.filter((l) => l.show).map((l) => (
              <Link key={l.to} to={l.to} className="whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium text-muted-foreground hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
                <Bell className="h-4 w-4" />
                {(notifs.data ?? []).some((n: { read_at: string | null }) => !n.read_at) && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-96 w-80 overflow-y-auto">
              <p className="mb-2 text-xs text-muted-foreground">In-app only · SMS adapter not configured</p>
              {(notifs.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No notifications yet.</p>}
              {(notifs.data ?? []).map((n: { id: string; title: string; body: string; created_at: string }) => (
                <div key={n.id} className="border-b py-2 last:border-0">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                </div>
              ))}
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={async () => { await supabase.auth.signOut(); nav({ to: "/" }); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-8">{children}</main>
    </div>
  );
}
