# Matching (deterministic greedy feasible insertion)
`src/lib/domain/matching.ts`
1. Candidates: active shared trips (planned/en route/in progress).
2. Hard filters with reason codes: TRIP_NOT_JOINABLE, DRIVER_INELIGIBLE (verification/restriction), CATEGORY_MISMATCH, CAPACITY_EXCEEDED, TIME_WINDOW_MISMATCH, PICKUP_TOO_FAR (distance to route polyline > 4 km).
3. Try every (pickup i, drop-off j≥i) insertion; reject PICKUP_ORDER_INVALID, CAPACITY_EXCEEDED (load along route), DETOUR_LIMIT_EXCEEDED (each rider's ride distance vs solo, against their own limit).
4. Economics via hybrid allocation: DRIVER_PAYOUT_FLOOR_UNMET / FARE_CEILING_EXCEEDED / DRIVER_NET_NEGATIVE.
5. Score feasible options (added distance, total detour, driver net); hard constraints always outrank score.
6. Assignment: optimistic lock on `trips.version` + unique partial index on live assignments; driver accept revalidates the version, else re-search.
7. No feasible match → stays SEARCHING (reasons logged in trip_events), new solo trip with nearest eligible driver, or explicit private fallback offered with consent.
