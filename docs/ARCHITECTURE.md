# Architecture
- TanStack Start (React 19, SSR on edge workers) + Tailwind v4 + shadcn; Lovable Cloud (Postgres, Auth, RLS).
- `src/lib/domain/*` — pure, tested business logic: money, geo/routing adapter, pricing (versioned), matching, state machine, negotiation, cancellation, payments (webhook verification/idempotency), places (demo gazetteer).
- `src/lib/api/*.server.ts` — trusted orchestration with the privileged DB client (core, booking, ops). Never imported by UI.
- `src/lib/api/*.functions.ts` — authenticated RPC (`requireSupabaseAuth`), zod-validated inputs; the only client entry points.
- `src/routes/api/public/payments/sandbox-webhook.ts` — HMAC-verified, idempotent sandbox webhook.
- UI routes: `/` landing, `/auth`, `/_authenticated/{ride,trips,trips/$id,driver,ops,account}`, `/share/$token` (trusted contact, minimal fields).
- Clients have SELECT-only (RLS-scoped) access; every write goes through server functions. DB triggers re-enforce state transitions, fare monotonicity and append-only ledgers (defence in depth).
- Provider adapters: routing = simulated haversine×road-factor; maps = none (schematic stop strip); SMS = none (in-app notifications); payments = sandbox; GPS = none.
