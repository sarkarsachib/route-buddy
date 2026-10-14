# Security & privacy
- Server-authoritative: fares, states, assignments, payments, roles all computed/written server-side; clients have SELECT-only RLS access.
- Roles in a separate table; `has_role`/`has_any_role` security-definer helpers; privileged actions audited (append-only audit_logs).
- Inputs validated with zod; webhook HMAC with timing-safe compare, idempotent by event id, amount check.
- Trusted-contact link exposes state, labels, driver name/vehicle only; no precise location is collected in this build.
- Incident data readable only by reporter + safety_reviewer/admin; incident list access is audited. Evidence upload/storage is **not implemented** (TODO: private bucket, encryption, access logging, retention).
- No selfie verification; document verification is a manual ops workflow (documents not uploaded in this build).
- AI is not used for safety decisions. Triage hint uses reported category only.
- TODO before launch: rate limiting, phone OTP auth, GPS anti-spoofing, dependency/security scanning in CI, backups/restore drills, DPDP legal review, privacy notice & grievance officer, retention schedule, disable demo mode.
