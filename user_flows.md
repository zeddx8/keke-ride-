# User Flows

## 1. Passenger Ride Request
1. Passenger opens app, map centers on device GPS.
2. Drags pin to exact pickup and types landmark note (e.g., "Behind Pedu Junction").
3. Sets destination and views the calculated fare (based on MySQL distance * admin rate).
4. Taps **Request**. The UI shows a loading state. Laravel Reverb subscribes the client to a private trip channel.
5. Rider accepts; passenger UI updates via WebSocket to show the rider's name, keke plate number, and a live marker moving on the map.

## 2. Rider Dispatch Acceptance
1. Rider toggles "Online". App begins transmitting lat/lng to the API every 5 seconds (stored in Redis/MySQL).
2. Incoming request triggers a Capacitor native push/sound and a modal with a 20-second countdown.
3. Rider taps **Accept**.
4. Rider navigates to pickup, taps **Arrived**, then **Start Trip** when the passenger boards, and **Complete Trip** upon arrival to finalize the cash transaction.