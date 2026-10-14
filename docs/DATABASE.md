# Database
Migration: `drizzle/migrations/0000_tandem_core_schema.sql`. UUID PKs, timestamptz (UTC), money as bigint paise.
Key invariants:
- `uq_driver_one_active_trip` (one active trip per driver), `uq_booking_one_active_assignment` (one live assignment per booking) → no double-booking under concurrency.
- `enforce_booking_rules` trigger: valid transitions only, version must increment (optimistic concurrency), ceiling/reference immutable, guaranteed payable cannot increase, final fare immutable.
- Append-only: fare_ledger, fare_allocations, booking_events, audit_logs, incident_actions, quotes, pricing_versions(config); driver_payout_ledger allows only one-time settlement linking.
- RLS: owners read their own rows; staff read by role via `has_any_role` (security definer). Verification records, trip stops, trip events readable only by staff; passengers get sanitized views through the server (co-passenger stops anonymised).
- Seed data is flagged `is_demo` / `pilot_unvalidated` (5 demo drivers, 1 demo shared trip Duttapukur→Sealdah).
Geospatial: lat/lng double columns + btree index; PostGIS + GiST index is a recommended upgrade before scale.
