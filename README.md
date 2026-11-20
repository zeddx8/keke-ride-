# Keke Ride 🛺

> **Modern tricycle ride-hailing and parcel delivery platform designed for Cape Coast, Ghana.** Built with high-concurrency real-time WebSocket dispatch, spatial GPS geo-fencing, multi-modal payments (Cash, In-App Wallet, MTN MoMo / Vodafone Cash), and zero-trust security.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────────┐
                      │    Keke Ride Mobile & Web Clients        │
                      │  (React 19 + TypeScript + Capacitor +    │
                      │   Tailwind CSS v4 + Leaflet OpenStreetMap)│
                      └────────────────────┬─────────────────────┘
                                           │
                        REST / Sanctum Auth │ WebSockets (Echo)
                                           ▼
                      ┌──────────────────────────────────────────┐
                      │    Laravel 11 Backend API & Services    │
                      │   - Spatial Dispatch Engine              │
                      │   - Fare Calculator (GH₵ Ghana Cedis)    │
                      │   - Hubtel SMS OTP Gateway               │
                      │   - Dual-Ledger Wallet Compensation      │
                      │   - Admin Audit & Incident Response Desk │
                      └─────────────┬──────────────────┬─────────┘
                                    │                  │
                SQL Spatial Queries │                  │ Broadcast Events
                                    ▼                  ▼
                      ┌──────────────────┐    ┌──────────────────┐
                      │  MariaDB / MySQL │    │  Laravel Reverb  │
                      │  (Spatial Points │    │  (Port 8080      │
                      │   & DB Cache)    │    │   WebSocket Bus) │
                      └──────────────────┘    └──────────────────┘
```

---

## Key Features

### 1. Passenger Experience
- **Interactive Routing & Geocoding:** Real-time pickup/dropoff selection via OpenStreetMap and OSRM routing.
- **Accurate Cape Coast Pricing:** Base fare `GH₵ 5.00` + `GH₵ 3.00/km` distance calculation.
- **Multiple Payment Channels:** Cash on completion, digital in-app wallet, or direct Mobile Money (MTN MoMo, Telecel Cash, AT Money).
- **Safety & Trip Live-Share:** One-tap SOS emergency dialing (`112`), live shareable trip link (`/trip-share/:token`), and trusted contact notifications.
- **Saved Places & History:** Instant booking to frequent destinations (Campus, Market, Home, Work) and trip ratings with comments.

### 2. Driver Partner Portal
- **Duty Controls:** Real-time online/offline shift toggle with daily shift limit monitoring and fatigue break prompts.
- **Real-Time Dispatch Radar:** Instant audio alert cues for incoming rides with interactive 15-second swipe-to-accept timer.
- **Turn-by-Turn Navigation:** In-app route guidance or deep-linking to Google Maps and Waze.
- **Transparent Wallet Ledger:** 85% driver net earning credited automatically on wallet trip completion, with 15% platform commission accounting.
- **Document Expiry Warnings:** Automatic alerts for Driver's License and Tricycle Insurance renewal dates.

### 3. Staff & Admin Control Center
- **Role-Based Access Control (RBAC):** Granular permissions for `super_admin`, `operations`, and `support`.
- **Live Active Fleet Radar:** Real-time tracking of all active trips and available drivers across Cape Coast.
- **KYC Driver Verification:** Document review desk for Ghana Card and Driver's License approvals.
- **Incident Resolution Desk:** Categorized ticketing (`safety`, `fare_dispute`, `lost_item`) with assignment and audit trails.
- **Financial & Operational Analytics:** Exportable CSV reports for revenue, completed trips, and platform commissions.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Mobile Client** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Capacitor 8 (Android/iOS) |
| **Mapping & GIS** | Leaflet, React-Leaflet, OpenStreetMap, OSRM Routing Engine |
| **Backend Framework**| Laravel 11, PHP 8.2+ |
| **Authentication** | Laravel Sanctum (Token-based API with server-side revocation on logout) |
| **Realtime WebSockets**| Laravel Reverb on port 8080 with Pusher/Echo protocol |
| **Database** | MariaDB / MySQL with Spatial Extensions (`ST_Point`, `ST_Distance_Sphere`) |
| **SMS Gateway** | Hubtel SMS API for phone OTP verification |
| **Notifications** | Firebase Cloud Messaging (FCM) & In-App Dynamic Toast System |

---

## Project Structure

```
keke-ride/
├── backend/                       # Laravel 11 API Backend
│   ├── app/
│   │   ├── Events/                # Real-time WebSocket Events (TripStatusUpdated, TripRequested)
│   │   ├── Http/
│   │   │   ├── Controllers/       # API, Trip, Location, Profile, Admin Controllers
│   │   │   └── Middleware/        # Sanctum Auth, Admin Active, Role Guards
│   │   ├── Jobs/                  # DispatchRideJob background queue worker
│   │   ├── Models/                # Eloquent Models (User, Trip, RiderProfile, WalletTransaction)
│   │   └── Services/              # Hubtel SMS, Firebase Push, Routing Services
│   ├── config/                    # Laravel, Services, and Reverb Configuration
│   ├── database/
│   │   └── migrations/            # Database schema and spatial table migrations
│   ├── routes/                    # API and Channel broadcast route definitions
│   └── tests/                     # Automated PHPUnit / Pest test suites
│
├── mobile/                        # React + TypeScript + Capacitor Mobile App
│   ├── android/                   # Capacitor Native Android Studio Project
│   ├── public/                    # Assets, Favicon, SVG Icons
│   └── src/
│       ├── api/                   # Axios client with 401/403 interceptors & Echo WebSockets
│       ├── components/            # SettingsMenu, AccountAvatar, TripHistory, TripSafety, Toast
│       ├── context/               # AuthContext, ToastContext
│       ├── hooks/                 # Geolocation tracking and device permissions
│       ├── pages/                 # PassengerHome, DriverHome, AdminDashboard, Login, TripShare
│       └── services/              # FCM Native Push Notification handlers
│
└── README.md                      # Platform documentation
```

---

## Requirements

- **PHP:** `^8.2` (Extensions: `pdo_mysql`, `openssl`, `mbstring`, `fileinfo`, `curl`)
- **Composer:** `^2.x`
- **Node.js:** `^20.x` or `^22.x`
- **npm:** `^10.x`
- **Database:** MariaDB `^10.6` or MySQL `^8.0` (with Spatial Extension enabled)

---

## Getting Started

### 1. Database Setup
Ensure MariaDB or MySQL is running on port `3306`:
```sql
CREATE DATABASE keke_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE keke_app_testing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend Installation & Setup
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
```

### 3. Mobile Client Installation & Build
```bash
cd ../mobile
npm install
npm run build
npx cap sync android
```

---

## Running the Application

In separate terminal windows, start the respective services:

1. **MariaDB Database:**
   ```bash
   mysqld --standalone
   ```

2. **Laravel REST API Server:**
   ```bash
   cd backend
   php artisan serve --host 0.0.0.0 --port 8000
   ```

3. **Laravel Reverb WebSocket Server:**
   ```bash
   cd backend
   php artisan reverb:start --host 0.0.0.0 --port 8080
   ```

4. **Background Queue Worker (Trip Dispatch Engine):**
   ```bash
   cd backend
   php artisan queue:work --tries=1
   ```

5. **Mobile Web Dev Server:**
   ```bash
   cd mobile
   npm run dev -- --host 0.0.0.0
   ```
   Access the app at: `http://localhost:5173`

---

## Environment Variables Configuration

| Variable | Description | Default / Example |
|---|---|---|
| `APP_URL` | Base API URL | `http://localhost:8000` |
| `DB_CONNECTION` | Database engine | `mysql` |
| `DB_DATABASE` | Production database name | `keke_app` |
| `RIDE_BASE_FARE` | Base trip fare in GH₵ | `5.00` |
| `RIDE_FARE_PER_KM` | Rate per kilometer in GH₵ | `3.00` |
| `REVERB_APP_KEY` | Reverb WebSocket connection key | `keke-ride-key` |
| `REVERB_HOST` | WebSocket hostname | `0.0.0.0` |
| `REVERB_PORT` | WebSocket listen port | `8080` |
| `REVERB_SCHEME` | WebSocket connection scheme | `http` |
| `HUBTEL_CLIENT_ID` | Hubtel SMS API Client ID | *(Leave blank for local log driver)* |
| `HUBTEL_CLIENT_SECRET` | Hubtel SMS API Secret | *(Leave blank for local log driver)* |
| `PLACE_SEARCH_URL` | Nominatim OpenStreetMap search endpoint | `https://nominatim.openstreetmap.org/search` |
| `ROUTING_URL` | OSRM routing engine service URL | `https://router.project-osrm.org` |

---

## Testing & Quality Assurance

Run the automated test suites to ensure full verification:

```bash
# Backend Automated Tests (PHPUnit)
cd backend
php artisan test

# Mobile TypeScript & Production Build Verification
cd ../mobile
npm run build
```

---

## License

This project is licensed under the MIT License.
