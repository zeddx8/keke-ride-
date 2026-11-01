# Technical Requirements Document (TRD)

## 1. Architecture Overview
A monolithic backend serving an API to a web-based admin panel and a hybrid mobile application.

* **Backend:** Laravel 11 (PHP)
* **Mobile Clients (Rider & Passenger):** React + TypeScript + Vite, wrapped with Capacitor for Android APK generation and native device access (geolocation, push).
* **Web Admin:** React + TypeScript + Vite (Web SPA).
* **Database:** MySQL 8.0+ (utilizing `SRID 4326` and `SPATIAL INDEX` for proximity matching).
* **Real-Time / Events:** Laravel Reverb (WebSockets) for incoming ride offers and live GPS tracking.
* **Cache:** Redis for rate limiting, ephemeral rider locations, and queue management.
* **Auth:** Laravel Sanctum for lightweight API token issuance.

## 2. Core Data Model (MySQL)
* `users` (id, phone, role, status)
* `rider_profiles` (user_id, license_number, ghana_card, verification_status)
* `rider_locations` (rider_id, location POINT SRID 4326, is_online, updated_at) — *Indexed spatially.*
* `trips` (id, passenger_id, rider_id, pickup_point, landmark_note, destination, estimated_fare, status)
* `payments` (id, trip_id, method: cash, amount, status)

## 3. Security & Infrastructure
* **Auth:** Sanctum bearer tokens stored securely in Capacitor's encrypted local storage.
* **Validation:** Strict FormRequests in Laravel to sanitize all inputs.
* **Spatial Queries:** Direct use of `ST_Distance_Sphere` to calculate distances under 2km natively in MySQL, preventing memory exhaustion from loading all coordinates.