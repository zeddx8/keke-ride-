# MVP Scope

## 1. In Scope
* **Authentication:** SMS OTP via Hubtel/Termii paired with Laravel Sanctum tokens.
* **Core Loop:** Passenger requests a ride with a landmark note → MySQL spatial query finds riders within a 2km radius → Laravel Reverb broadcasts the request with a 20s timeout → Rider accepts and navigates to pickup.
* **Payments:** 100% Cash trips for MVP.
* **Deployment Target:** Cape Coast pilot zone.
* **Admin:** React-based web dashboard to verify rider documents manually.

## 2. Deferred to Phase 2
* **Digital Payments:** Automated mobile money deductions (MTN, Telecel) via Paystack webhooks and ledger tracking.
* **iOS Support:** MVP is exclusively Android (Capacitor APK).
* **Complex Routing:** Machine learning matching and surge pricing.