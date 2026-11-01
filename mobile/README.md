# Keke Ride

Keke Ride is a ride-booking application with a Laravel API backend and a React, TypeScript, Vite, and Capacitor client. The client serves passengers, riders, and administrators. These instructions are for Windows PowerShell.

## Prerequisites

- PHP 8.2 or newer, Composer, and the PHP extensions required by Laravel, including GD.
- MySQL 8 with spatial data support. The trip tables use spatial point columns; SQLite is not suitable for the full application.
- Node.js and npm.
- Android Studio and an Android SDK only if building/running the Android app.

Check the installed versions:

```powershell
php --version
composer --version
node --version
npm --version
mysql --version
```

## 1. Create the development database

Start MySQL, then create the local database. Change the database name if you prefer, but use the same name in `backend/.env`.

```powershell
mysql -u root -p -e "CREATE DATABASE keke_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

If the database already exists, this command is unnecessary.

## 2. Configure and start the Laravel API

Open a PowerShell terminal at the project root:

```powershell
cd backend
composer install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

If `backend/.env` already exists, keep it and do not overwrite it. Edit it and set the local database connection values:

```dotenv
APP_NAME="Keke Ride"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://127.0.0.1:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=keke_app
DB_USERNAME=root
DB_PASSWORD=your_local_mysql_password
```

Generate the application key, run migrations, and clear cached configuration:

```powershell
php artisan key:generate
php artisan migrate
php artisan optimize:clear
```

Run `php artisan key:generate` only when setting up a new local environment without an application key. Do not replace an existing key; Laravel uses it to protect encrypted application data.

The `.env.example` includes development defaults for place search and road routing (Nominatim and OSRM). Follow their usage policies. They are demo services, not production providers. See the backend [README](../backend/README.md) for provider operations and application behavior.

### Enable realtime updates locally

The passenger and rider interfaces use Laravel Reverb for ride and location updates. Set these values in `backend/.env`:

```dotenv
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=local-keke
REVERB_APP_KEY=local-keke-key
REVERB_APP_SECRET=local-keke-secret
REVERB_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http
REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8080
```

Start the Laravel API in its own terminal from `backend`:

```powershell
php artisan serve --host=0.0.0.0 --port=8000
```

Start the queue worker in a second terminal from `backend`:

```powershell
php artisan queue:work --tries=1
```

Start Reverb in a third terminal from `backend`:

```powershell
php artisan reverb:start --host=0.0.0.0 --port=8080
```

The backend uses the database queue by default. The queue worker and Reverb process must remain running for background dispatch and realtime events. For local OTP testing, generated codes are written to `backend/storage/logs/laravel.log`; treat these codes as sensitive. There is no configured SMS provider, and production registration/verification/recovery is blocked until one is integrated.

## 3. Configure and start the React client

Open a new PowerShell terminal at the project root:

```powershell
cd mobile
npm ci
```

Create `mobile/.env.local` with the API and Reverb connection values:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000/api
VITE_REVERB_APP_KEY=local-keke-key
VITE_REVERB_HOST=127.0.0.1
VITE_REVERB_PORT=8080
VITE_REVERB_SCHEME=http
```

Do not commit `.env.local`. Vite variables are bundled into the client and are visible to users; never put server secrets in `VITE_*` values. Restart Vite after editing environment variables.

Start the client:

```powershell
npm run dev -- --host 0.0.0.0
```

Open the local URL printed by Vite, usually `http://localhost:5173`. Use the same machine for the API, queue worker, and Reverb while developing in a desktop browser.

### Android emulator or physical device

The Android emulator cannot reach the development computer using `127.0.0.1`. For an Android emulator, change the client API and Reverb hosts in `mobile/.env.local` to `10.0.2.2`. For a physical device, use the development computer's LAN IP address (for example, `192.168.1.20`) and allow the API/WebSocket ports through the local firewall. The API and Reverb servers must listen on `0.0.0.0`.

After setting the mobile environment values, build and sync the web client into the native Android project:

```powershell
npm run build
npx cap sync android
npx cap open android
```

Run the app from Android Studio, or use a connected emulator/device with:

```powershell
npx cap run android
```

If the Android platform has not yet been added to this checkout, add it once before syncing:

```powershell
npx cap add android
```

iOS builds require macOS and Xcode.

## Passenger, rider, and admin workflow

1. Register as a passenger or rider in the app. Public registration does not create admin accounts.
2. In local development, read the registration OTP from `backend/storage/logs/laravel.log` and enter it in the app.
3. Passengers can select a destination, save named places, add pickup instructions, review fare/payment details, and request a ride.
4. Riders submit their licence, Ghana Card, and vehicle information. An administrator must approve the application before the rider can go online.
5. To access the admin dashboard, an authorized operator must provision/promote an admin account. Use Forgot password to set its initial password through the OTP flow.
6. Ride requests require an approved, online rider with a recent location. Keep Reverb and the queue worker running for the realtime dispatch experience.

## Build, lint, and test

Run client checks from `mobile`:

```powershell
npm run lint
npm run build
```

Run backend tests and style checks from `backend`:

```powershell
php artisan test
vendor\bin\pint --test
```

The production client bundle is written to `mobile/dist`. To preview the built bundle locally:

```powershell
npm run preview -- --host 0.0.0.0
```

## Google Maps (optional)

The passenger and rider screens currently use Leaflet/OpenStreetMap. There is a Google Maps component in the source, but it is not wired into those screens. To use Google Maps, create and restrict a Google Maps Platform key, then set `VITE_GOOGLE_MAPS_API_KEY` in `mobile/.env.local` (never commit it). The map integration must also be changed to use that component. Google Maps display does not switch the backend place-search or road-routing providers.

## Design system

Use a high-contrast, energetic, and trustworthy visual system. Keep colors and interaction patterns consistent across passenger and rider screens.

### Color

| Token | Value | Use |
| --- | --- | --- |
| Keke Yellow | `#FFC107` | Primary actions such as “Request Ride” and “Go Online,” active states, and highlighted routes. |
| Safety Blue | `#0056D2` | Map location pins, passenger/rider indicators, links, and secondary actions. |
| Dark Neutral | `#1E1E1E` | Primary text, navigation, and dark UI elements. |
| White | `#FFFFFF` | Cards and input surfaces. |
| Off-White | `#F5F5F5` | App backgrounds and subtle surface separation. |
| Success Green | `#34A853` | Accepted rides and successful payments. |
| Error Red | `#EA4335` | Connection and validation errors. |
| Muted Gray | `#757575` | Captions and secondary text. |

### Typography

Use Inter as the primary sans-serif font, with a system sans-serif fallback. Use semibold or bold headings (weights 600–700) at 24–32px, regular or medium body text (400–500) at about 16px, and 12–14px captions in Muted Gray. Maintain readable contrast and a clear hierarchy between labels, values, and supporting information.

### Layout and components

- Keep booking and dispatch screens map-centric, with a clean, muted map.
- Anchor search and ride actions near the bottom of the screen for comfortable thumb reach.
- Present fare, pickup, and ride details in white cards with 12–16px corner radii and subtle shadows.
- Make incoming-request actions prominent and easy to tap. Distinguish Accept from Decline through clear labels and contrasting button treatments; do not rely on color alone.
- Use Keke Yellow for the primary action and Safety Blue for secondary actions and navigation cues.

### Accessibility and implementation

Provide a visible keyboard-focus treatment and respect reduced-motion preferences. The shared color, typography, radius, and shadow tokens are defined in `src/index.css` and exposed as Tailwind utilities; keep both those tokens and `tailwind.config.js` aligned with the palette above. Global styles provide focus treatment, readable defaults, and reduced-motion rules.

## Passenger and rider video script

Use this storyboard to record a 2–3 minute walkthrough. Start the API, queue worker, Reverb, and client as described above. Prepare a test passenger and an approved rider account; the rider must be online with a recent location for dispatch. Use test data and never show passwords, OTPs, or personal documents.

| Scene | On-screen action | Narration |
| --- | --- | --- |
| 1. Introduction | Show the Keke Ride app and sign-in screen. | “Keke Ride brings passengers looking for a trip together with approved local riders.” |
| 2. Passenger booking | Sign in as a passenger. On the map, choose a destination, add pickup instructions or select a saved place, and review fare and payment details. | “The passenger selects a destination, confirms pickup details, and reviews the trip before requesting a ride.” |
| 3. Request submitted | Submit the request and show the waiting/dispatch state. | “After confirmation, the ride request is sent for dispatch.” |
| 4. Rider readiness | Switch to the approved rider account. Show the rider going online and sharing their location. | “An approved rider goes online and shares a recent location to receive nearby requests.” |
| 5. Accept and update | Show the incoming request and accept it. Switch back to the passenger view to show the updated ride status, then show the rider trip screen. | “The rider accepts the request. Reverb keeps ride and location updates moving between the rider and passenger screens.” |
| 6. Close | Show both role screens or the app branding. | “From choosing a destination to rider dispatch, Keke Ride supports the trip for both sides.” |

**Recording tips:** Use the OTP from `backend/storage/logs/laravel.log` only with a local test account. Keep the queue worker and Reverb running for realtime updates. If demonstrating rider onboarding, explain that the rider submits licence, Ghana Card, and vehicle information and must be approved by an administrator before going online; do not display actual documents. Local OTPs are logged, and production verification requires an SMS provider. If you cannot show a live dispatch, record the passenger and rider steps separately and identify the result as an edited demonstration.
