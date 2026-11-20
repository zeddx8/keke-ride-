<?php

namespace App\Services;

use App\Models\Trip;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class FirebasePushService
{
    public function sendTripRequest(User $rider, Trip $trip, int $timeoutSeconds): bool
    {
        if (! $rider->push_notifications_enabled) {
            return false;
        }

        if (! $rider->fcm_token) {
            return false;
        }

        $serverKey = env('FIREBASE_SERVER_KEY');
        if (! $serverKey) {
            Log::warning('Firebase push delivery is not configured.', [
                'rider_id' => $rider->id,
                'trip_id' => $trip->id,
            ]);
            return false;
        }

        try {
            $response = Http::timeout(10)->withHeaders([
                'Authorization' => 'key=' . $serverKey,
                'Content-Type' => 'application/json',
            ])->post('https://fcm.googleapis.com/fcm/send', [
                'to' => $rider->fcm_token,
                'priority' => 'high',
                'notification' => [
                    'title' => 'New ride request',
                    'body' => 'Accept a trip to ' . ($trip->dropoff_address ?: 'your destination'),
                    'android_channel_id' => 'ride_requests',
                ],
                'data' => [
                    'type' => 'trip_request',
                    'trip_id' => (string) $trip->id,
                    'expires_in' => (string) $timeoutSeconds,
                ],
            ]);

            if (! $response->successful()) {
                Log::error('Firebase push delivery returned an error.', [
                    'rider_id' => $rider->id,
                    'trip_id' => $trip->id,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return false;
            }

            return true;
        } catch (\Throwable $exception) {
            Log::error('Firebase push delivery failed.', [
                'rider_id' => $rider->id,
                'trip_id' => $trip->id,
                'error' => $exception->getMessage(),
            ]);
            return false;
        }
    }
}
