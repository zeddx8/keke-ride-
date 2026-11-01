<?php

namespace App\Http\Controllers;

use App\Events\TripAccepted;
use App\Events\TripStatusUpdated;
use App\Jobs\DispatchRideJob;
use App\Models\RiderLocation;
use App\Models\Trip;
use App\Models\User;
use App\Services\PlaceSearchService;
use App\Services\TripRoutingException;
use App\Services\TripRoutingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Validator;

class TripController extends Controller
{
    public function places(Request $request, PlaceSearchService $places)
    {
        if ($request->user()->role !== 'passenger') {
            abort(403, 'Only passengers can search for destinations.');
        }

        $request->merge(['q' => trim((string) $request->input('q'))]);
        $validated = $request->validate([
            'q' => 'required|string|min:3|max:120',
        ]);

        try {
            return response()->json([
                'results' => $places->search($validated['q']),
            ]);
        } catch (TripRoutingException $exception) {
            $headers = $exception->httpStatus === 429
                ? ['Retry-After' => (string) max(1, (int) config('services.place_search.provider_interval_seconds', 1))]
                : [];

            return response()->json(['message' => $exception->getMessage()], $exception->httpStatus, $headers);
        }
    }

    public function estimate(Request $request, TripRoutingService $routing)
    {
        if ($request->user()->role !== 'passenger') {
            abort(403, 'Only passengers can estimate trips.');
        }

        $validated = $this->validateCoordinates($request);

        try {
            return response()->json($this->calculateQuote($validated, $routing));
        } catch (TripRoutingException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->httpStatus);
        }
    }

    public function current(Request $request)
    {
        $user = $request->user();

        if (! in_array($user->role, ['passenger', 'rider'], true)) {
            abort(403, 'Only passengers and riders can view current trips.');
        }

        $ownershipColumn = $user->role === 'passenger' ? 'passenger_id' : 'rider_id';
        $trip = Trip::query()
            ->where($ownershipColumn, $user->id)
            ->whereIn('status', ['searching', 'accepted', 'arrived', 'started'])
            ->select([
                'id',
                'passenger_id',
                'rider_id',
                'status',
                'pickup_location',
                'destination_location',
                'landmark_note',
                'estimated_distance_km',
                'estimated_fare',
                'route_geometry',
                'payment_method',
                'created_at',
            ])
            ->selectRaw('ST_Y(pickup_point) as pickup_latitude, ST_X(pickup_point) as pickup_longitude')
            ->selectRaw('ST_Y(destination_point) as destination_latitude, ST_X(destination_point) as destination_longitude')
            ->orderByDesc('created_at')
            ->first();

        return response()->json([
            'is_online' => $user->role === 'rider' && $user->status === 'active',
            'trip' => $trip,
        ]);
    }

    public function createShare(Request $request, Trip $trip)
    {
        if ((int) $trip->passenger_id !== (int) $request->user()->id) {
            abort(403, 'You are not authorized to share this trip.');
        }

        if (! in_array($trip->status, ['searching', 'accepted', 'arrived', 'started'], true)) {
            throw ValidationException::withMessages([
                'trip' => ['Only active trips can be shared live.'],
            ]);
        }

        $token = bin2hex(random_bytes(32));
        $trip->update([
            'share_token' => hash('sha256', $token),
            'share_expires_at' => now()->addHours(12),
        ]);

        return response()->json([
            'token' => $token,
            'expires_at' => $trip->share_expires_at->toIso8601String(),
        ], 201);
    }

    public function revokeShare(Request $request, Trip $trip)
    {
        if ((int) $trip->passenger_id !== (int) $request->user()->id) {
            abort(403, 'You are not authorized to stop sharing this trip.');
        }

        $trip->update([
            'share_token' => null,
            'share_expires_at' => null,
        ]);

        return response()->json(['message' => 'Live trip sharing stopped.']);
    }

    public function publicShare(string $token)
    {
        if (! preg_match('/^[a-f0-9]{64}$/i', $token)) {
            abort(404, 'Trip share link was not found.');
        }

        $trip = Trip::query()
            ->where('share_token', hash('sha256', strtolower($token)))
            ->first();

        if (! $trip) {
            abort(404, 'Trip share link was not found.');
        }

        if (! $trip->share_expires_at || $trip->share_expires_at->isPast()) {
            $trip->update([
                'share_token' => null,
                'share_expires_at' => null,
            ]);
            abort(410, 'This live trip share has expired.');
        }

        $coordinates = DB::selectOne('
            SELECT
                ST_Y(pickup_point) as pickup_latitude,
                ST_X(pickup_point) as pickup_longitude,
                ST_Y(destination_point) as destination_latitude,
                ST_X(destination_point) as destination_longitude
            FROM trips
            WHERE id = ?
        ', [$trip->id]);

        $riderLocation = $trip->rider_id
            ? RiderLocation::query()->where('rider_id', $trip->rider_id)->first()
            : null;

        return response()->json([
            'trip' => [
                'id' => $trip->id,
                'status' => $trip->status,
                'pickup' => [
                    'label' => $trip->pickup_location,
                    'note' => $trip->landmark_note,
                    'latitude' => (float) $coordinates->pickup_latitude,
                    'longitude' => (float) $coordinates->pickup_longitude,
                ],
                'destination' => [
                    'label' => $trip->destination_location,
                    'latitude' => (float) $coordinates->destination_latitude,
                    'longitude' => (float) $coordinates->destination_longitude,
                ],
                'estimated_fare' => (float) $trip->estimated_fare,
                'payment_method' => $trip->payment_method,
                'rider_location' => $riderLocation ? [
                    'latitude' => (float) $riderLocation->latitude,
                    'longitude' => (float) $riderLocation->longitude,
                    'updated_at' => $riderLocation->updated_at?->toIso8601String(),
                ] : null,
                'share_expires_at' => $trip->share_expires_at->toIso8601String(),
            ],
        ]);
    }

    public function history(Request $request)
    {
        $user = $request->user();

        if (! in_array($user->role, ['passenger', 'rider'], true)) {
            abort(403, 'Only passengers and riders can view trip history.');
        }

        $ownershipColumn = $user->role === 'passenger' ? 'passenger_id' : 'rider_id';
        $trips = Trip::query()
            ->where($ownershipColumn, $user->id)
            ->with([
                'rating:id,trip_id,rating,comment',
                'incidents' => fn ($incidents) => $incidents
                    ->where('created_by', $user->id)
                    ->select([
                        'id',
                        'trip_id',
                        'category',
                        'summary',
                        'reporter_message',
                        'status',
                        'resolved_at',
                        'created_at',
                    ])
                    ->latest(),
            ])
            ->select([
                'id',
                'rider_id',
                'status',
                'pickup_location',
                'destination_location',
                'landmark_note',
                'estimated_distance_km',
                'estimated_fare',
                'payment_method',
                'created_at',
            ])
            ->selectRaw('ST_Y(pickup_point) as pickup_lat, ST_X(pickup_point) as pickup_lng')
            ->selectRaw('ST_Y(destination_point) as destination_lat, ST_X(destination_point) as destination_lng')
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($trips);
    }

    public function riderSummary(Request $request)
    {
        if ($request->user()->role !== 'rider') {
            abort(403, 'Only riders can view their trip summary.');
        }

        $today = now()->startOfDay();
        $week = now()->startOfWeek();
        $summary = Trip::query()
            ->where('rider_id', $request->user()->id)
            ->where('status', 'completed')
            ->where('completed_at', '>=', $week)
            ->selectRaw(
                'SUM(CASE WHEN completed_at >= ? THEN 1 ELSE 0 END) as trips_today,
                SUM(CASE WHEN completed_at >= ? THEN 1 ELSE 0 END) as trips_this_week,
                SUM(CASE WHEN completed_at >= ? THEN estimated_fare ELSE 0 END) as estimated_fares_today,
                SUM(estimated_fare) as estimated_fares_this_week,
                SUM(CASE WHEN completed_at >= ? THEN estimated_distance_km ELSE 0 END) as distance_today_km,
                SUM(estimated_distance_km) as distance_this_week_km',
                [$today, $week, $today, $today],
            )
            ->first();

        return response()->json([
            'trips_today' => (int) $summary->trips_today,
            'trips_this_week' => (int) $summary->trips_this_week,
            'estimated_fares_today' => round((float) $summary->estimated_fares_today, 2),
            'estimated_fares_this_week' => round((float) $summary->estimated_fares_this_week, 2),
            'distance_today_km' => round((float) $summary->distance_today_km, 2),
            'distance_this_week_km' => round((float) $summary->distance_this_week_km, 2),
        ]);
    }

    public function navigation(Request $request, Trip $trip, TripRoutingService $routing)
    {
        if ($request->user()->role !== 'rider') {
            abort(403, 'Only riders can request rider navigation.');
        }

        if ((int) $trip->rider_id !== (int) $request->user()->id) {
            abort(403, 'You are not assigned to this trip.');
        }

        if (! in_array($trip->status, ['accepted', 'arrived', 'started'], true)) {
            abort(422, 'Navigation is only available for an active trip.');
        }

        $validated = $request->validate([
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
        ]);

        $target = $trip->status === 'started' ? 'destination' : 'pickup';
        $destination = $target === 'pickup'
            ? DB::selectOne(
                'SELECT ST_Y(pickup_point) as latitude, ST_X(pickup_point) as longitude FROM trips WHERE id = ?',
                [$trip->id],
            )
            : DB::selectOne(
                'SELECT ST_Y(destination_point) as latitude, ST_X(destination_point) as longitude FROM trips WHERE id = ?',
                [$trip->id],
            );

        try {
            $route = $routing->route(
                (float) $validated['latitude'],
                (float) $validated['longitude'],
                (float) $destination->latitude,
                (float) $destination->longitude,
            );
        } catch (TripRoutingException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->httpStatus);
        }

        return response()->json([
            'target' => $target,
            'distance_km' => $route['distance_km'],
            'duration_minutes' => $route['duration_minutes'],
            'geometry' => $route['geometry'],
        ]);
    }

    public function requestRide(Request $request, TripRoutingService $routing)
    {
        if ($request->user()->role !== 'passenger') {
            abort(403, 'Only passengers can request trips.');
        }

        $validated = $this->validateCoordinates($request);
        $request->validate([
            'pickup_location' => 'nullable|string|max:255',
            'landmark_note' => 'nullable|string|max:255',
            'destination_location' => 'required|string|max:255',
        ]);

        try {
            $quote = $this->calculateQuote($validated, $routing);
        } catch (TripRoutingException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->httpStatus);
        }

        $trip = Trip::create([
            'passenger_id' => $request->user()->id,
            'pickup_location' => $request->input('pickup_location', 'Current Location'),
            'landmark_note' => $request->input('landmark_note'),
            'destination_location' => $request->input('destination_location'),
            'pickup_point' => DB::raw("ST_GeomFromText('POINT({$validated['pickup_lng']} {$validated['pickup_lat']})', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT({$validated['destination_lng']} {$validated['destination_lat']})', 4326)"),
            'status' => 'searching',
            'estimated_fare' => $quote['estimated_fare'],
            'estimated_distance_km' => $quote['estimated_distance_km'],
            'route_geometry' => $quote['route_geometry'],
        ]);

        $freshLocationCutoff = now()->subMinutes((int) config('ride.rider_location_freshness_minutes'));
        $riders = User::query()
            ->with(['riderLocation' => function ($query) use ($freshLocationCutoff) {
                $query->where('is_online', true)
                    ->where('updated_at', '>=', $freshLocationCutoff);
            }])
            ->whereHas('riderProfile', function ($query) {
                $query->where('verification_status', 'approved');
            })
            ->where('role', 'rider')
            ->where('status', 'active')
            ->get(['id']);
        $onlineRiderIds = $riders
            ->sortBy(function (User $rider) use ($validated) {
                $location = $rider->riderLocation;
                if (! $location) {
                    return PHP_FLOAT_MAX;
                }

                return $this->distanceInKilometers(
                    (float) $validated['pickup_lat'],
                    (float) $validated['pickup_lng'],
                    (float) $location->latitude,
                    (float) $location->longitude,
                );
            })
            ->pluck('id')
            ->values()
            ->all();

        if (empty($onlineRiderIds)) {
            $trip->update(['status' => 'cancelled']);

            return response()->json(['message' => 'No Kekes are currently online.'], 404);
        }

        // Trigger the dispatch loop to alert drivers one by one
        DispatchRideJob::dispatch($trip, $onlineRiderIds);

        return response()->json([
            'id' => $trip->id,
            'status' => $trip->status,
            'estimated_fare' => $trip->estimated_fare,
            'estimated_distance_km' => $trip->estimated_distance_km,
            'route_geometry' => $trip->route_geometry,
        ], 201);
    }

    public function accept(Request $request, Trip $trip)
    {
        if ($request->user()->role !== 'rider') {
            abort(403, 'Only riders can accept trips.');
        }

        if (! $request->user()->riderProfile()
            ->where('verification_status', 'approved')
            ->exists()) {
            abort(403, 'Your account must be approved before accepting trips.');
        }

        $trip = DB::transaction(function () use ($request, $trip) {
            $trip = Trip::query()->whereKey($trip->id)->lockForUpdate()->firstOrFail();

            if ($trip->status !== 'searching') {
                throw ValidationException::withMessages([
                    'trip' => ['This trip is no longer available.'],
                ]);
            }

            $trip->update([
                'status' => 'accepted',
                'rider_id' => $request->user()->id,
            ]);

            return $trip;
        });

        $coords = DB::selectOne('
            SELECT 
                ST_Y(pickup_point) as pickup_lat, 
                ST_X(pickup_point) as pickup_lng,
                ST_Y(destination_point) as destination_lat,
                ST_X(destination_point) as destination_lng
            FROM trips WHERE id = ?
        ', [$trip->id]);

        // Ping the passenger's mobile app over WebSockets to let them know the driver is on the way
        event(new TripAccepted($trip));

        return response()->json([
            'id' => $trip->id,
            'status' => $trip->status,
            'rider_id' => $trip->rider_id,
            'pickup_latitude' => $coords->pickup_lat,
            'pickup_longitude' => $coords->pickup_lng,
            'destination_latitude' => $coords->destination_lat,
            'destination_longitude' => $coords->destination_lng,
            'destination_location' => $trip->destination_location,
            'landmark_note' => $trip->landmark_note,
        ]);
    }

    public function updateStatus(Request $request, Trip $trip)
    {
        if ($request->user()->role !== 'rider') {
            abort(403, 'Only riders can update trip status.');
        }

        $validated = $request->validate([
            'status' => 'required|in:arrived,started,completed',
        ]);

        $trip = DB::transaction(function () use ($request, $trip, $validated) {
            $trip = Trip::query()->whereKey($trip->id)->lockForUpdate()->firstOrFail();

            if ((int) $trip->rider_id !== (int) $request->user()->id) {
                abort(403, 'You are not assigned to this trip.');
            }

            $nextStatus = [
                'accepted' => 'arrived',
                'arrived' => 'started',
                'started' => 'completed',
            ][$trip->status] ?? null;

            if ($validated['status'] !== $nextStatus) {
                throw ValidationException::withMessages([
                    'status' => ['The trip cannot move to that status from its current status.'],
                ]);
            }

            $trip->update([
                'status' => $validated['status'],
                ...($validated['status'] === 'completed' ? ['completed_at' => now()] : []),
            ]);

            return $trip;
        });

        event(new TripStatusUpdated($trip));

        return response()->json([
            'id' => $trip->id,
            'status' => $trip->status,
            'rider_id' => $trip->rider_id,
        ]);
    }

    public function cancel(Request $request, Trip $trip)
    {
        if ($request->user()->role !== 'passenger') {
            abort(403, 'Only passengers can cancel ride requests.');
        }

        $trip = DB::transaction(function () use ($request, $trip) {
            $trip = Trip::query()->whereKey($trip->id)->lockForUpdate()->firstOrFail();

            if ((int) $trip->passenger_id !== (int) $request->user()->id) {
                abort(403, 'You are not authorized to cancel this ride request.');
            }

            if ($trip->status !== 'searching') {
                throw ValidationException::withMessages([
                    'trip' => ['Only ride requests that are still searching can be cancelled.'],
                ]);
            }

            $trip->update(['status' => 'cancelled']);

            return $trip;
        });

        event(new TripStatusUpdated($trip, 'Ride request cancelled.'));

        return response()->json([
            'id' => $trip->id,
            'status' => $trip->status,
        ]);
    }

    private function validateCoordinates(Request $request): array
    {
        $validator = validator($request->all(), [
            'pickup_lat' => 'required|numeric|between:-90,90',
            'pickup_lng' => 'required|numeric|between:-180,180',
            'destination_lat' => 'required|numeric|between:-90,90',
            'destination_lng' => 'required|numeric|between:-180,180',
        ]);

        $validator->after(function (Validator $validator) use ($request) {
            if (
                $request->filled('pickup_lat')
                && $request->filled('pickup_lng')
                && $request->filled('destination_lat')
                && $request->filled('destination_lng')
                && (float) $request->input('pickup_lat') === (float) $request->input('destination_lat')
                && (float) $request->input('pickup_lng') === (float) $request->input('destination_lng')
            ) {
                $validator->errors()->add('destination_lat', 'Choose a destination different from your pickup point.');
            }
        });

        return $validator->validate();
    }

    private function calculateQuote(array $coordinates, TripRoutingService $routing): array
    {
        $route = $routing->route(
            (float) $coordinates['pickup_lat'],
            (float) $coordinates['pickup_lng'],
            (float) $coordinates['destination_lat'],
            (float) $coordinates['destination_lng'],
        );
        $estimatedDistanceKm = $route['distance_km'];
        $estimatedFare = round(
            (float) config('ride.base_fare') + $estimatedDistanceKm * (float) config('ride.fare_per_km'),
            2,
        );

        return [
            'estimated_distance_km' => $estimatedDistanceKm,
            'estimated_fare' => $estimatedFare,
            'duration_minutes' => $route['duration_minutes'],
            'route_geometry' => $route['geometry'],
            'currency' => 'GHS',
            'estimate_note' => 'Road route estimate; actual travel time may vary.',
        ];
    }

    private function distanceInKilometers(float $latitudeA, float $longitudeA, float $latitudeB, float $longitudeB): float
    {
        $latitudeDelta = deg2rad($latitudeB - $latitudeA);
        $longitudeDelta = deg2rad($longitudeB - $longitudeA);
        $a = sin($latitudeDelta / 2) ** 2
            + cos(deg2rad($latitudeA)) * cos(deg2rad($latitudeB)) * sin($longitudeDelta / 2) ** 2;

        return 2 * 6371.0088 * asin(min(1, sqrt($a)));
    }
}
