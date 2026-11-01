<?php

namespace App\Http\Controllers;

use App\Models\Trip;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TripRatingController extends Controller
{
    public function store(Request $request, Trip $trip)
    {
        if ($request->user()->role !== 'passenger') {
            abort(403, 'Only passengers can rate completed trips.');
        }

        $validated = $request->validate([
            'rating' => 'required|integer|between:1,5',
            'comment' => 'nullable|string|max:500',
        ]);

        $rating = DB::transaction(function () use ($request, $trip, $validated) {
            $trip = Trip::query()->whereKey($trip->id)->lockForUpdate()->firstOrFail();

            if ((int) $trip->passenger_id !== (int) $request->user()->id) {
                abort(403, 'You are not authorized to rate this trip.');
            }

            if ($trip->status !== 'completed' || $trip->rider_id === null) {
                throw ValidationException::withMessages([
                    'trip' => ['Only completed trips with an assigned rider can be rated.'],
                ]);
            }

            if ($trip->rating()->exists()) {
                throw ValidationException::withMessages([
                    'rating' => ['This trip has already been rated.'],
                ]);
            }

            return $trip->rating()->create([
                'passenger_id' => $request->user()->id,
                'rider_id' => $trip->rider_id,
                'rating' => $validated['rating'],
                'comment' => $validated['comment'] ?? null,
            ]);
        });

        return response()->json([
            'id' => $rating->id,
            'trip_id' => $rating->trip_id,
            'rating' => $rating->rating,
            'comment' => $rating->comment,
        ], 201);
    }

    public function summary(Request $request)
    {
        if ($request->user()->role !== 'rider') {
            abort(403, 'Only riders can view their rating summary.');
        }

        $ratings = $request->user()->ratingsReceived();
        $count = $ratings->count();
        $average = $ratings->avg('rating');

        return response()->json([
            'average_rating' => $average === null ? null : round((float) $average, 2),
            'ratings_count' => $count,
        ]);
    }
}
