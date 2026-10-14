# Threat model (summary)
| Threat | Current mitigation | Gap |
|---|---|---|
| Fake accounts | Email confirmation | Phone OTP, KYC for drivers, device signals |
| Account takeover | Supabase auth, leaked-password check available | MFA, session anomaly detection |
| GPS spoofing | No client GPS trusted; completion requires assigned driver + state chain | Trusted location provider & plausibility checks (TODO) |
| Location scraping | No live location stored/shared; RLS hides stops from passengers | — |
| Fare manipulation | Server-only pricing, DB triggers (ceiling, monotonic), immutable history | — |
| Duplicate webhooks | Unique event id + idempotent processor (tested) | Real provider integration |
| Unauthorized refunds | Role check, over-refund guard, audit | Dual approval above threshold |
| Driver/passenger collusion | Ledger + reconciliation | Anomaly analytics |
| DoS | Edge platform defaults | App-level rate limits (not implemented) |
| Insider access | Least-privilege RLS, audited actions | Access reviews, break-glass process |
| Demo role self-grant | Gated on `app_config.demo_mode`, audited | **Must be disabled pre-launch** |
