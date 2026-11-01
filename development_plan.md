# Development Plan

## Phase 1: Database & API Core
* Initialize Laravel 11 project.
* Configure MySQL spatial columns (`POINT`) and indexing.
* Build Sanctum OTP authentication flows and basic CRUD endpoints for profiles.

## Phase 2: WebSockets & Spatial Matching
* Install and configure Laravel Reverb and Redis.
* Build the geospatial matching logic (`ST_Distance_Sphere`) to query nearby online riders.
* Implement the dispatch queue: pinging the closest rider, waiting 20s, and falling back to the next.

## Phase 3: Mobile Apps (React + Vite + Capacitor)
* Initialize the React workspace.
* Build the Passenger flow (Map, request ride, live tracking).
* Build the Rider flow (Online toggle, incoming request modal, trip state progression).
* Implement Capacitor plugins for Geolocation and Native Audio (for ride alerts).

## Phase 4: Admin Panel & Cash Ledger
* Build the React Admin SPA.
* Implement rider approval workflows and fare configuration settings.
* Add end-of-trip ledger calculations to track platform commissions owed by cash-collecting riders.

## Phase 5: Pilot & Scale
* Compile release APKs via Android Studio.
* Onboard the first 20–50 verified riders in Cape Coast.
* Monitor Reverb connection stability and MySQL query execution times under live load.
* Begin planning Phase 2 Paystack integration for automated MoMo commission deductions.