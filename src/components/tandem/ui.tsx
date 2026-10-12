import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/domain/money";
import { AlertTriangle, Loader2 } from "lucide-react";

export function Money({ paise, className }: { paise: number | string | null | undefined; className?: string }) {
  if (paise == null) return <span className={className}>—</span>;
  return <span className={cn("tabular font-mono", className)}>{formatINR(Number(paise))}</span>;
}

const STATE_TONE: Record<string, string> = {
  QUOTED: "bg-muted text-muted-foreground",
  SEARCHING: "bg-info/15 text-info",
  MATCH_PROPOSED: "bg-warning/25 text-warning-foreground",
  MATCH_CONFIRMED: "bg-success/15 text-success",
  DRIVER_EN_ROUTE: "bg-success/15 text-success",
  DRIVER_ARRIVED: "bg-accent/30 text-accent-foreground",
  PASSENGER_ONBOARD: "bg-primary/10 text-primary",
  IN_PROGRESS: "bg-primary text-primary-foreground",
  COMPLETED: "bg-success text-success-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
  EXPIRED: "bg-muted text-muted-foreground",
  SUPPORT_REVIEW: "bg-destructive/15 text-destructive",
};
const STATE_LABEL: Record<string, string> = {
  QUOTED: "Quoted", SEARCHING: "Searching", MATCH_PROPOSED: "Awaiting driver", MATCH_CONFIRMED: "Confirmed",
  DRIVER_EN_ROUTE: "Driver on the way", DRIVER_ARRIVED: "Driver arrived", PASSENGER_ONBOARD: "Onboard",
  IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled", EXPIRED: "Expired", SUPPORT_REVIEW: "Support review",
};
export function StateBadge({ state }: { state: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATE_TONE[state] ?? "bg-muted")}>{STATE_LABEL[state] ?? state}</span>;
}

export const MODE_LABEL: Record<string, string> = {
  PRIVATE: "Private", SHARE_AND_SAVE: "Share & Save", SHARED_NOW: "Shared Now", BUDGET: "Budget", GROUP_PRIVATE: "Group Private",
};

export function DemoTag({ children = "DEMO" }: { children?: ReactNode }) {
  return <span className="rounded border border-warning bg-warning/20 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-warning-foreground">{children}</span>;
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-sm sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-bold sm:text-lg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}
export function ErrorBox({ error }: { error: unknown }) {
  return <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{(error as Error)?.message ?? "Something went wrong"}</div>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export function Row({ label, value, strong, hint }: { label: ReactNode; value: ReactNode; strong?: boolean; hint?: ReactNode }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", strong && "text-base font-semibold")}>
      <span className="text-muted-foreground">{label}{hint && <span className="block text-xs">{hint}</span>}</span>
      <span>{value}</span>
    </div>
  );
}

/** Schematic route strip — NOT a map. No maps provider is configured. */
export function RouteStrip({ stops }: { stops: { label: string; type: string; status?: string; mine?: boolean }[] }) {
  return (
    <div>
      <ol className="relative space-y-3 pl-6">
        <span className="route-line absolute bottom-2 left-[7px] top-2 w-[2px]" aria-hidden />
        {stops.map((s, i) => (
          <li key={i} className="relative">
            <span className={cn("absolute -left-6 top-1 h-4 w-4 rounded-full border-2", s.type === "pickup" ? "border-success bg-card" : "border-primary bg-primary", s.status === "done" && "opacity-40", s.mine === false && "border-muted-foreground bg-muted")} />
            <div className={cn("text-sm", s.status === "done" && "text-muted-foreground line-through")}>
              <span className="mr-1 text-xs uppercase text-muted-foreground">{s.type === "pickup" ? "Pickup" : "Drop"}</span>
              {s.label}
              {s.status === "arrived" && <span className="ml-2 text-xs text-accent-foreground">· driver here</span>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-muted-foreground">Schematic stop order · no live map (maps provider not configured)</p>
    </div>
  );
}

export function errMsg(e: unknown) {
  return (e as Error)?.message ?? "Request failed";
}
