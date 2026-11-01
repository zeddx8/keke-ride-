<?php

namespace App\Http\Controllers;

use App\Events\RiderLocationUpdated;
use App\Models\RiderLocation;
use App\Models\Trip;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    public function updateStatus(Request $request)
    {
        $validated = $request->validate([
            'status' => 'required_without:is_online|string|in:active,offline',
            'is_online' => 'required_without:status|boolean',
        ]);

        $user = $request->user();

        // Ensure only riders can go online
        if ($user->role !== 'rider') {
            return response()->json(['message' => 'Unauthorized. Only drivers can update status.'], 403);
        }

        $status = isset($validated['status'])
            ? $validated['status']
            : ($validated['is_online'] ? 'active' : 'offline');

        if ($status === 'active' && ! $user->riderProfile()
            ->where('verification_status', 'approved')
            ->exists()) {
            return response()->json([
                'message' => 'Your account must be approved before you can go online.',
            ], 403);
        }

        // Update the driver's status in the database so the dispatch loop can find them
        $user->update(['status' => $status]);
        RiderLocation::query()
            ->where('rider_id', $user->id)
            ->update(['is_online' => $status === 'active']);

        return response()->json([
            'message' => 'Status updated successfully.',
            'status' => $user->status,
        ]);
    }

    public function updateLocation(Request $request)
    {
        $validated = $request->validate([
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
        ]);

        $rider = $request->user();

        if ($rider->role !== 'rider') {
            return response()->json([
                'message' => 'Unauthorized. Only drivers can update their location.',
            ], 403);
        }

        $activeTrips = Trip::query()
            ->where('rider_id', $rider->id)
            ->whereIn('status', ['accepted', 'arrived', 'started'])
            ->get();

        if ($activeTrips->isEmpty() && $rider->status !== 'active') {
            return response()->json([
                'message' => 'Location updates are only available while online or during an active trip.',
            ], 409);
        }

        $location = RiderLocation::updateOrCreate(
            ['rider_id' => $rider->id],
            [
                'latitude' => $validated['latitude'],
                'longitude' => $validated['longitude'],
                'is_online' => $rider->status === 'active',
            ],
        );

        foreach ($activeTrips as $trip) {
            event(new RiderLocationUpdated(
                $trip->id,
                (float) $location->latitude,
                (float) $location->longitude,
                $rider,
            ));
        }

        return response()->json([
            'message' => 'Location updated.',
            'updated_at' => $location->updated_at,
        ]);
    }
}
