# Pricing (version `v1-demo`, NOT business-approved)
Private fare = base ₹40 + ₹14/km + ₹1/min (time component must be legally permitted & disclosed) × vehicle multiplier, min ₹60, + tolls. Integer paise, round-half-up.
Platform commission 15%. **Gross driver payout = fare − commission** (not net; net estimate subtracts ₹5/km operating cost).

Share & Save: ceiling = private fare; guaranteed discount 8%; potential additional up to 40% total (conditional).

## Allocation method `hybrid-v0.1-UNAPPROVED`
For a shared route R:
1. Benchmark = gross payout of a private trip over the **same full route, time and vehicle**.
2. Target = ⌈1.05 × benchmark⌉. Required passenger total T = smallest amount whose gross payout ≥ target.
3. Base fare split equally; remainder split by each passenger's own (solo fare − base) contribution → different pickups/drop-offs give different fares.
4. No passenger exceeds their current guaranteed payable; excess is water-filled onto others with headroom. If impossible → infeasible (`DRIVER_PAYOUT_FLOOR_UNMET`), never relaxed.
5. On driver acceptance every rider's guarantee becomes min(current, allocation).
Driver protection at trip close: solo shared trip → paid at least the private benchmark; ≥2 riders → at least 105%. Shortfall (e.g. co-passenger cancelled after guarantees) is booked as `reserve_topup` from a platform cancellation reserve — funding is an open decision.
