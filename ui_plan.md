# UI Plan

## 1. Design Principles
* **Performance:** Vite build must be highly optimized. Minimal heavy assets to keep the Capacitor APK size under 15MB.
* **Visibility:** High contrast text (minimum 16px) for riders operating in direct sunlight.
* **Action-Oriented:** Primary buttons (Request, Accept, Arrived) must span 90% of the screen width for easy tapping while moving.

## 2. Key React Components
* **Map Interface:** `@react-google-maps/api` or Leaflet. Map tile loading must be throttled to save user data.
* **Countdown Ring:** SVG animated ring for the 15-20s rider acceptance window.
* **Bottom Sheets:** Spring-animated bottom sheets for trip state (Fare Estimate → Rider Found → Trip in Progress).
* **Admin Data Tables:** React Table for filtering pending rider approvals and live active trips.