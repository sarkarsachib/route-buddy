# Tandem (codename) — shared mobility marketplace MVP for India
Responsive web/PWA with passenger, driver and operations interfaces, server-authoritative pricing/matching, append-only financial ledgers and RLS. **Demo mode**: simulated routing, sandbox payments, seeded demo drivers. Not a production transport service.

Try it: sign up → Book (Barasat → Sealdah, Share & Save) → your ride joins the seeded demo trip. In **Account**, grant yourself `ops_agent` (demo only) → **Operations → Drivers → Simulate** the demo driver to accept and progress the trip.

Docs: see `docs/` (PRODUCT_SPEC, ARCHITECTURE, API, DATABASE, PRICING, MATCHING_ALGORITHM, SECURITY, THREAT_MODEL, OPEN_DECISIONS, TEST_PLAN, DEPLOYMENT).
Tests: `bunx vitest run`.
