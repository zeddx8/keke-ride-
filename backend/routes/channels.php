<?php

use App\Models\Trip;
use Illuminate\Support\Facades\Broadcast;

// Authorize the driver's private channel
Broadcast::channel('rider.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id && $user->role === 'rider';
});

// Authorize the passenger's private channel (for when the driver accepts)
Broadcast::channel('passenger.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id && $user->role === 'passenger';
});

Broadcast::channel('trip.{tripId}', function ($user, $tripId) {
    return Trip::query()
        ->whereKey($tripId)
        ->whereIn('status', ['accepted', 'arrived', 'started'])
        ->where(function ($query) use ($user) {
            if ($user->role === 'passenger') {
                $query->where('passenger_id', $user->id);
            } elseif ($user->role === 'rider') {
                $query->where('rider_id', $user->id);
            } else {
                $query->whereRaw('1 = 0');
            }
        })
        ->exists();
});