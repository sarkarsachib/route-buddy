# Product spec — "Tandem" (placeholder codename)
Shared mobility marketplace for India; pilot candidate corridor Duttapukur–Barasat–Madhyamgram–Kolkata (**configurable, unvalidated**). INR, integer paise only.

## Ride modes (implemented)
| Mode | Behaviour |
|---|---|
| PRIVATE | One party; disclosed private fare (= genuine reference). |
| SHARE_AND_SAVE | Ceiling = private fare; guaranteed discount at booking; conditional extra savings if a feasible co-passenger joins. Joins existing feasible shared trip or opens a new one. |
| SHARED_NOW | Quote lists the best feasible existing shared trip with a passenger-specific fare; revalidated at confirm; expires if no longer feasible. |
| BUDGET | Passenger sets max. If ≥ private fare → private. Else only existing feasible shared trips, or negotiation (offer/counter/accept with expiry) within [85% private, budget]. |
| GROUP_PRIVATE | Private, up to vehicle capacity (SUV 6). |
Optional categories (WOMEN_ONLY, MEN_ONLY, SENIOR_FRIENDLY, SAFE_RIDE_HOME) exist in config as **unavailable pending review**; selecting one is blocked, never substituted. Phase 2: scheduled/recurring, fixed driver routes.

## Fare principles
Ceiling immutable; guaranteed payable monotonic non-increasing (DB trigger); final ≤ ceiling (DB check); savings shown only vs. genuine private fare; immutable quote + allocation history.

## Roles
passenger, driver, ops_agent, safety_reviewer, finance, admin — stored in `user_roles`, enforced server-side and in RLS. Demo mode lets a tester self-grant roles (audited) — **must be disabled before launch** (`app_config.demo_mode=false`).
