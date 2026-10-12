import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/tandem/AppShell";

const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/ride");

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => z.object({ next: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Sign in · Tandem shared rides" },
      { name: "description", content: "Sign in to book Share & Save or private rides on the Duttapukur–Kolkata corridor (demo)." },
      { property: "og:title", content: "Sign in · Tandem shared rides" },
      { property: "og:description", content: "Sign in to book shared or private rides." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + safeNext(next), data: { display_name: name } } });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your account, then sign in.");
          setMode("in");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: safeNext(next) });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    sessionStorage.setItem("tandem-next", safeNext(next));
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) return toast.error(String(r.error.message ?? r.error));
    if (r.redirected) return;
    nav({ to: safeNext(next) });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
        <Link to="/"><Logo /></Link>
        <h1 className="mt-4 text-2xl font-bold">{mode === "in" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every new account starts as a passenger.</p>
        <Button variant="outline" className="mt-5 w-full" onClick={google}>Continue with Google</Button>
        <div className="my-4 text-center text-xs text-muted-foreground">or with email</div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <div><Label htmlFor="n">Display name</Label><Input id="n" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} /></div>
          )}
          <div><Label htmlFor="e">Email</Label><Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><Label htmlFor="p">Password</Label><Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}</Button>
        </form>
        <button className="mt-4 w-full text-center text-sm text-muted-foreground underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
