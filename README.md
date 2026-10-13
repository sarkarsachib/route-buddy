# Route Buddy

Build a complete, production-oriented full-stack shared mobility marketplace for India, project codename "Tandem" (placeholder name, not final branding). This is not a generic taxi-booking landing page. Build the actual responsive application, core business workflows, database schema, server-side logic, role-based views, and tests. Use Lovable's supported full-stack TypeScript stack and Supabase/Postgres if available. Prefer a modular, well-typed architecture. Since native Android apps are not directly the primary Lovable deliverable, build responsive passenger and driver experiences that work on mobile web/PWA, plus a desktop operations dashboard. Do not claim this alone is a production-ready transport business; keep external integrations sandbox/configurable and document launch blockers.

PRODUCT VISION
A ride-sharing marketplace for India that matches passengers travelling along compatible routes. Passengers can book private or shared rides without finding other riders themselves. When compatible passengers join, the system recalculates each passenger's allocated fare transparently. The passenger's confirmed fare ceiling is a hard cap. Driver economics are protected: target shared-trip driver payout >= 105% of a comparable private-trip driver payout, using a clearly documented benchmark. If constraints cannot all be satisfied, do not force a match; offer a transparent fallback. Pilot geography candidate: Duttapukur-Barasat-Madhyamgram-Kolkata corridor, marked as configurable and unvalidated. Languages planned: English, Bengali, Hindi. Currency INR; store money as integer paise, never floating-point.

PRODUCT PRINCIPLES
- Fare shown before confirmation; show confirmed fare ceiling, current guaranteed fare, guaranteed discount, and conditional/potential savings separately.
- Never charge more than the confirmed ceiling. Once a discount becomes guaranteed, a co-passenger cancellation must not increase the remaining passenger's fare.
- Reference fares must be genuine; never fake savings by inflating the baseline.
- The driver +5% payout target applies only to eligible shared trips and must compare equivalent route/time/vehicle/payout definitions. Gross payout is not net earnings. Account for additional time, distance, fuel/operating costs, waiting, tolls, platform costs, and cancellation exposure.
- Do not confirm economically infeasible combinations. Do not silently relax any safety, eligibility, fare, capacity, or driver payout constraint.
- Safety outranks match completion. No selfie verification. Use appropriate identity/driver/vehicle-document verification workflows with restricted access to sensitive documents.
- AI must not infer predatory character, dangerousness, criminality, or intoxication from facial appearance. AI can help prioritize observable operational signals for human review only.
- No fabricated integrations, mock payment-success claims, or fake test results. Clearly label simulated data/demo mode.

RIDE MODES
1. PRIVATE: one booking party, no unrelated passengers.
2. SHARE & SAVE: passenger books with confirmed maximum fare ceiling; eligible shared matches may enable additional savings. Distinguish guaranteed and conditional savings.
3. SHARED NOW: join an existing feasible shared ride with a quoted passenger-specific fare.
4. BUDGET RIDE: passenger sets a max budget; only confirm after feasible driver/route found.
5. GROUP PRIVATE: family/group booking, respecting vehicle capacity.
Phase 2: scheduled/recurring commute.
Optional configurable categories subject to legal/operational review: MEN_ONLY, WOMEN_ONLY, SENIOR_FRIENDLY (not automatically senior-only; extra boarding time/accessibility), SAFE_RIDE_HOME (private ride by default if shared suitability uncertain). Never silently substitute a category. No need to force these optional categories into MVP if incomplete; make them configurable and explicitly marked unavailable until approved. A passenger chooses preferences per trip, not as permanent profile categorization.

USER ROLES
- Passenger: create quotes/bookings, choose preferences, set budget, negotiate, see own fare breakdown, track trip, share trip status, cancel, report issue, request refund.
- Driver: onboarding/verification status, vehicle details, availability, optional route publication, receive/accept/reject offers, counteroffer, navigate/handoff, confirm arrival/pickup/dropoff, view payout estimate, report incident.
- Operations agent: inspect assigned bookings/support cases, contact participants, initiate authorized refunds.
- Safety reviewer: review incident cases/evidence with restricted access, escalate emergency, apply proportionate temporary restrictions, record decisions and appeals.
- Finance operator: reconciliation and settlements.
- Admin: configurable pricing/matching/service areas/category rules, manage roles, audit logs.
Use least privilege, audit privileged actions, and don't allow silent rewriting of historic fare records.

INITIAL RELEASE SCOPE
Build a working web/PWA MVP with:
- polished public landing page explaining Share & Save and Private Ride;
- passenger booking flow with pickup/dropoff, route preview/map placeholder if no map key, date/time, passenger count, ride mode, max detour, accessibility/language preferences;
- quote result and transparent fare breakdown;
- fare ceiling and guaranteed vs conditional discount UI;
- passenger dashboard with booking states, active trip status, history, cancellation and report issue;
- driver dashboard with availability, offers, accept/reject/counteroffer, assigned trip stops, payout preview and trip state updates;
- operations/admin dashboard for bookings, drivers, matching status, financial ledger/reconciliation, safety incidents, service area/pricing configuration, audit events;
- negotiation workflow with expiry;
- trip tracking UI, trusted-contact sharing action, emergency call action for India 112;
- cancellation/no-show workflow with explicit rules;
- cash payment record and a provider-agnostic digital payment abstraction; sandbox only until configured;
- database persistence, authentication, row-level access policies, seed/demo data, responsive design, empty/loading/error states.
If live routing/payment/SMS/maps credentials are absent, use explicit provider adapters and visibly labelled demo/simulation mode. Do not pretend external integrations are live. Prioritize working end-to-end flows over decorative screens.

ARCHITECTURE
Use Lovable-supported React + TypeScript + Tailwind/shadcn UI and Supabase/Postgres where available. Organize as modular features:
- identity/profiles/verification
- service areas
- quotes/pricing
- bookings/state machine
- matching/route feasibility
- drivers/vehicles
- trips/stops/events
- negotiation
- payments/refunds/settlements
- safety/incidents
- notifications
- operations/admin
- analytics
Use server-side trusted logic (Supabase Edge Functions/RPC/server functions as appropriate) for fare calculations, state transitions, assignment, payment webhooks and privileged operations. Client must never be authoritative for fare, payment status, role, eligibility or trip completion. If an operation cannot be safely implemented server-side in the current environment, leave a clear TODO and block production claims rather than faking security.

DATA MODEL
Create migrations/schema and RLS policies for:
- profiles/users: id, phone/email auth reference, display name, preferred language, account status, timestamps.
- passenger_profiles: user_id, accessibility and notification preferences.
- driver_profiles: user_id, verification status, availability status, rating summary.
- vehicles: id, driver_id, vehicle type, registration reference, seating capacity, verification status.
- verification_records: subject, type, status, verified/expiry times, restricted document reference; do not expose raw documents broadly.
- service_areas: name, boundary/configuration, status.
- quotes: id, passenger, quote type, pickup/dropoff, distance/duration estimate, initial fare ceiling, guaranteed discount, conditional/potential discount, pricing version, expiry.
- bookings: id, passenger, quote, ride type, passenger count, pickup/dropoff, time window, max detour, category preferences, state, confirmed fare ceiling, timestamps.
- trips: id, driver, vehicle, state, planned route/stops, start/completion.
- trip_bookings: trip_id, booking_id, pickup/dropoff sequence, assignment state.
- trip_stops: trip, sequence, type, location, booking, planned/actual arrival.
- fare_allocations: booking, trip, quoted/guaranteed/final amounts, allocation method, pricing version, calculation snapshot.
- fare_ledger: append-only entries, booking, type, integer-paise amount, reason/reference, timestamp.
- driver_payout_ledger: trip, append-only entry type, amount, reason, settlement status.
- negotiation_offers: booking, creator, amount in paise, status, expiry.
- payment_records: booking, provider reference, method, amount, status, idempotency key.
- refunds, trip_events, safety_incidents, notifications, audit_logs.
Use UUIDs, UTC timestamps, PostGIS/geospatial support if available. Index status, timestamps, driver availability, and geospatial fields. Use foreign keys and uniqueness constraints to prevent duplicate active assignments. Keep financial/audit history traceable. Sensitive incident evidence and verification documents need restricted storage and access.

BOOKING STATE MACHINE
DRAFT -> QUOTED -> SEARCHING -> MATCH_PROPOSED -> MATCH_CONFIRMED -> DRIVER_EN_ROUTE -> DRIVER_ARRIVED -> PASSENGER_ONBOARD -> IN_PROGRESS -> COMPLETED.
Allowed terminal/failure states: CANCELLED, EXPIRED, SUPPORT_REVIEW. Enforce valid transitions server-side and store actor, timestamp, reason. A client event alone cannot complete a trip. Use locking/optimistic concurrency and idempotency keys.

PRICING SPEC
- Private fare components: configured base, distance component, optional legally permitted/disclosed time component, applicable tolls/fees.
- SHARE & SAVE: store initial_fare_ceiling, guaranteed_discount, current_guaranteed_payable, potential_additional_discount, quote expiry. Current payable must never exceed confirmed ceiling. Once discount is guaranteed it cannot be clawed back. Keep immutable quote/calculation history.
- Passenger allocation method remains a product decision; recommend a transparent HYBRID incremental-cost model combining each passenger's route contribution, shared base costs and disclosed toll/fee allocation. Different pickup/dropoff distances must produce passenger-specific allocations; do not simply divide one total by passenger count. Put pricing method behind a versioned module and clearly mark unapproved assumptions.
- Driver shared payout target: min payout = 1.05 * comparable private driver payout. Define comparator by route/time/vehicle and payout semantics. Check additional distance/time/operating costs. If infeasible, reject that match or offer a consent-based alternative.
- Negotiation: passenger budget offer, driver counteroffer, acceptance/expiry; all amounts integer paise; accepted terms persist. Offers cannot bypass fare ceiling, driver payout floor, safety or legal constraints.
- Feasibility engine checks passenger ceilings, guaranteed discounts, driver payout, incremental route cost, time, capacity, platform costs, tolls, cancellation risk. Return feasible/infeasible plus reason codes and estimates. Never silently relax constraints.

MATCHING ALGORITHM
Objective: compatible shared rides while respecting route compatibility, pickup windows, passenger-specific detour limits, category eligibility, capacity, fare ceilings, driver payout target and platform economics.
1. Candidate generation via nearby pickup geospatial index, destination corridor, time window, driver availability.
2. Hard constraint filtering: serviceability, driver/vehicle eligibility, category, capacity, no conflicting trips, pickup before dropoff, detour limit, passenger fare ceiling, driver payout target.
3. For each candidate trip, insert new pickup/dropoff into possible route stop sequences, respecting pickup-before-dropoff; calculate route metrics with provider adapter.
4. Compute passenger-specific detours, added distance/time, proposed fare allocation and economics.
5. Rank feasible options using route overlap, lower total detour, lower added distance, pickup compatibility, driver value/earnings per online hour estimate, lower operational risk. Hard constraints always outrank score.
6. Transactionally revalidate and assign; use database locking/optimistic concurrency. Redis/cache alone is not sufficient for financial correctness.
7. If no feasible match, keep searching until expiry or offer clearly priced private fallback/time change with passenger consent.
Start with deterministic greedy feasible insertion; do not use ML before sufficient real data. Build explainable reason codes for rejection. Add tests for route overlap, different dropoffs, detour violations, category mismatch, capacity, fare cap, driver payout infeasibility and concurrent requests.
Pseudo:
function findMatches(booking):
 validate booking
 candidates = nearbyCompatibleTrips(booking)
 for candidate in candidates:
   if category/capacity/eligibility fail: continue
   route = insertPickupAndDropoff(candidate.route, booking)
   if pickup order invalid: continue
   metrics = calculateRouteMetrics(oldRoute, route, booking)
   if any passenger detour limit exceeded: continue
   fares = allocatePassengerFares(route, all passengers)
   if any fare exceeds confirmed ceiling: continue
   economics = calculateDriverAndPlatformEconomics(route, fares)
   if payout target or operational feasibility fails: continue
   add scored candidate
 for candidate in ranked candidates:
   if atomicRevalidationAndAssignment(candidate): return match
 return noFeasibleMatch

DRIVER ROUTES
Support dynamic driver availability first. Make fixed-route publication a later/feature-flagged capability with origin/destination, departure window, acceptable pickup/dropoff corridor, capacity, preferences and minimum payout. Avoid splitting a low-density pilot into too many route pools.

CANCELLATIONS
- Show terms before confirmation and use only disclosed/legal charges.
- Record actor, time and reason.
- Try replacement driver/passenger when feasible.
- A passenger's guaranteed fare never rises because a co-passenger cancels.
- Recalculate route and economics before replacing someone.
- If trip becomes infeasible, use disclosed fallback and never force new pricing.
- Configure no-show grace periods only after local testing/legal review.
- Establish cancellation reserve before guaranteed discounts at scale.

PAYMENTS
- Support cash and provider-agnostic approved digital payment adapter.
- Pay-after-arrival is supported.
- Track each passenger's amount due, collection method/status, receipt and driver payout.
- Digital payments: signed webhook verification, idempotent callbacks, server-side confirmation, reconciliation; never trust client success.
- Cash: record collected/due and reconcile driver balances.
- Use append-only ledger and compensating entries for corrections. Never mutate financial history silently. Do not store card credentials. Legal review needed for marketplace fund flow and driver payout handling.
- Use integer paise everywhere.

SAFETY
- Driver/vehicle document verification workflow; no selfie requirement.
- Trip tracking, trusted-contact sharing, emergency action (India 112), support escalation, incident reporting.
- Incident workflow: report -> severity triage -> emergency escalation if needed -> restricted evidence -> authorized review -> proportionate interim action -> review/appeal -> resolution.
- AI may prioritize reports, flag observable route deviations, summarize reports or identify repeated abuse signals for human review. It must not infer character or dangerousness from faces or automatically apply severe penalties based solely on unverified inference.
- Limit precise location access, encrypt sensitive data, log access to evidence, define lawful retention.

SECURITY/PRIVACY
- TLS, protected secrets, RLS and server-side authorization, rate limits, schema validation, audit logs, dependency/security scanning, backups and restore tests.
- Threat model: fake accounts, account takeover, GPS spoofing, location scraping, fare manipulation, duplicate payment webhooks, unauthorized refunds, collusion, DoS and insider access.
- Privacy by design, data minimization, clear privacy notices, lawful retention/deletion and grievance processes. Legal review of India's DPDP framework and relevant rules, transport/aggregator, consumer and payment rules is required before launch.
- Do not claim legal compliance without qualified review.

ADMIN/ANALYTICS
Provide metrics: request-to-match rate, median match time, completion, passenger actual savings vs genuine comparable private fare, waiting time, detour, cancellations, driver gross payout/trip, estimated net earnings/online hour, added distance/time, payout accuracy, platform contribution/completed trip, payment costs, refunds, support cost, incident rate and review times. Do not optimize match rate by violating detour/fare/safety constraints.

UI/UX DIRECTION
Build a polished, trustworthy, modern Indian mobility product, not a generic template. Mobile-first, fast, accessible, low-data friendly, multilingual-ready. Clear hierarchy and strong typography; elegant dark/navy and warm high-contrast accent palette; readable cards, map/route visualization, clear fare breakdown, strong status indicators. Avoid excessive gradients, glassmorphism, fake map data, and clutter. Show meaningful empty/loading/error states. Make every visible button functional or clearly disabled with an explanation. Use realistic but clearly marked seed data for demo accounts/trips. Include navigation between Passenger, Driver, and Operations demo roles if auth provider setup allows, while preserving real role-based security and never using a client-only role switch in production.

TESTS / ACCEPTANCE
Unit tests: fare calculation, fare cap, discount persistence, driver payout floor, detour, capacity, category eligibility, state transitions, cancellation, offer expiry, idempotency.
Integration: database transactions, provider adapters, payment webhook handling, notifications, reconciliation.
E2E: private booking; Share & Save; co-passenger joins; different dropoffs; incompatible route rejected; detour rejected; payout floor failure; co-passenger cancellation after guaranteed discount; driver cancellation; duplicate webhook; unauthorized trip completion; incident report; network interruption during confirmation.
Concurrency: simultaneous assignment cannot double-book driver/passenger.
Release gate: no known critical/high security defect without approved mitigation; all financial invariants pass; no duplicate assignment; server-side state enforcement; recovery tested.
Do not say tests passed unless actually run and report results.

DELIVERABLES
1. Working responsive web/PWA MVP with passenger, driver, operations interfaces.
2. Supabase/Postgres schema/migrations and row-level security policies.
3. Server-side quote/pricing/booking/matching/state transition logic, using adapters where external integrations are not configured.
4. Matching engine with deterministic feasible route insertion and explainable rejection reasons.
5. Financial ledger and settlement/reconciliation structure.
6. Negotiation, cancellation, safety and incident workflows.
7. Seed/demo data clearly labelled.
8. Automated tests.
9. README, docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md, docs/API.md, docs/DATABASE.md, docs/PRICING.md, docs/MATCHING_ALGORITHM.md, docs/SECURITY.md, docs/THREAT_MODEL.md, docs/OPEN_DECISIONS.md, docs/TEST_PLAN.md, docs/DEPLOYMENT.md.
10. Deployment instructions and a report of what is implemented vs simulated vs blocked by external credentials/legal decisions.

IMPLEMENTATION PLAN
First inspect the generated project and create a task plan. Then implement the foundation, database schema/RLS/auth, pricing and booking core, matching, passenger UI, driver UI, operations UI, payments/safety adapters, tests and documentation. Work incrementally, not as a static mockup. Keep unresolved decisions documented:
- passenger fare allocation method (recommended hybrid, requires approval),
- exact comparable private payout benchmark for +5% target,
- who funds cancellations that make guaranteed discounts uneconomic,
- initial pilot corridor,
- permitted ride categories,
- approved payment provider and legal fund flow,
- transport/aggregator permissions and insurance.
Build the largest coherent, testable MVP possible in this project. Prioritize financial correctness, matching constraints, privacy and working end-to-end flows over visual polish alone. Do not publish/deploy to production without explicit user authorization.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ee70494b-ac43-4af1-93fc-013c2a31ab4e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
