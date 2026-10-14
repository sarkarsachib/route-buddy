# Deployment
Built and hosted on Lovable (edge runtime + Lovable Cloud). Publishing is **not** done without explicit owner authorization.
Secrets: `SANDBOX_PAYMENT_WEBHOOK_SECRET` (generated). Real providers need: routing/maps key, SMS provider, payment provider keys + webhook secret, payout provider.
Pre-launch checklist: set `app_config.demo_mode=false`; remove/flag seeded demo drivers & trip; approve pricing version (`business_approved`); resolve OPEN_DECISIONS; legal sign-off; add rate limiting, evidence storage, phone OTP; run security scan; backups/restore test; E2E + integration suites green.

## Implemented vs simulated vs blocked
| Area | Status |
|---|---|
| Quotes, pricing, fare cap, guarantees, matching, state machine, assignments, cancellations, no-show, negotiation, ledgers, settlements (draft), refunds (ledger), incidents, support, audit, roles, RLS | Implemented (server + DB) |
| Routing/ETA | Simulated (haversine × 1.3, 22 km/h) |
| Maps | Not configured — schematic stop list |
| Digital payments | Sandbox adapter only; no money moves |
| Driver payouts | Ledger + settlement drafts only; transfer blocked |
| SMS / push | In-app notifications only |
| GPS tracking / trusted live location | Not implemented |
| Document upload / evidence storage | Not implemented (status workflow only) |
| Legal compliance | Not claimed; review required |
