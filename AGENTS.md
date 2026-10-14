<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Business rules live as pure functions in `src/lib/domain/` with unit tests; server orchestration in `src/lib/api/*.server.ts`; client entry only via `*.functions.ts`. Why: keeps fare/matching logic testable and server-authoritative.
- Clients get SELECT-only RLS access; all writes go through server functions using the privileged client after role checks. Why: client must never be authoritative for fare, state, role or payment.
- Money is integer paise everywhere; ledgers/allocations/events are append-only (DB triggers). Why: financial traceability.
- Booking state changes only via `transitionBooking` (TS check + optimistic version + DB trigger). Why: defence in depth for the state machine.
- External integrations sit behind adapters and are labelled simulated/sandbox until configured. Why: never imply live integrations.
