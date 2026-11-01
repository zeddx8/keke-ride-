# Product Requirements Document (PRD)

## 1. Overview
A lightweight ride-hailing app for tricycles (aboboyaa, pragya, keke). Trips are short, fares are low, and the product bypasses heavy ride-hailing features (surge pricing, multiple vehicle types) in favor of a fast, offline-tolerant loop for localized transit. 

## 2. Problem Statement
- Passengers hail tricycles via waving or calling trusted riders, leading to uncertain availability and pricing.
- Riders rely on localized regular customers, struggling to reach a broader passenger base.
- Address systems are inconsistent, requiring landmark-based navigation.

## 3. Goals
1. Allow passengers to request nearby tricycles in under a minute with fixed/transparent fare estimates.
2. Provide riders with a steady request flow and a clear, low-friction commission model.
3. Ensure basic safety features (verified riders, visible plates, trip sharing).
4. Prove the operational model in Cape Coast with an initial pilot of 20–50 riders.

## 4. Key Features (MVP)
* **Passenger App:** Phone OTP login, GPS pickup with landmark notes, upfront fare estimates, live driver tracking, cash payment, and an SOS/Share Trip button.
* **Rider App:** Document registration (Ghana Card, license), online/offline toggle, 15–20s request countdowns, trip state management (arrived, started, completed), and daily earnings view.
* **Admin Panel:** Rider document verification, active trip monitoring, dispute resolution, and base-fare configuration.