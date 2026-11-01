<?php

namespace Tests\Feature;

use App\Models\Trip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TripCurrentTest extends TestCase
{
    use RefreshDatabase;

    public function test_passenger_can_restore_their_searching_trip_and_route(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $otherPassenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createTrip($passenger, null, 'searching');
        $this->createTrip($otherPassenger, null, 'searching');

        $this->actingAs($passenger)
            ->getJson('/api/trips/current')
            ->assertOk()
            ->assertJsonPath('is_online', false)
            ->assertJsonPath('trip.id', $trip->id)
            ->assertJsonPath('trip.status', 'searching')
            ->assertJsonPath('trip.pickup_location', 'Pickup')
            ->assertJsonPath('trip.landmark_note', 'Wait outside the main gate')
            ->assertJsonPath('trip.destination_location', 'Destination')
            ->assertJsonPath('trip.estimated_fare', '11.25')
            ->assertJsonPath('trip.payment_method', 'cash')
            ->assertJsonPath('trip.pickup_latitude', 5.1)
            ->assertJsonPath('trip.destination_longitude', -1.25);
    }

    public function test_rider_can_restore_only_their_assigned_active_trip_and_online_state(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        $otherRider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($passenger, $rider, 'started');
        $this->createTrip($passenger, $otherRider, 'accepted');

        $this->actingAs($rider)
            ->getJson('/api/trips/current')
            ->assertOk()
            ->assertJsonPath('is_online', true)
            ->assertJsonPath('trip.id', $trip->id)
            ->assertJsonPath('trip.status', 'started')
            ->assertJsonPath('trip.rider_id', $rider->id);
    }

    public function test_current_endpoint_returns_null_when_user_has_no_active_trip(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider', 'status' => 'offline']);

        $this->actingAs($passenger)
            ->getJson('/api/trips/current')
            ->assertOk()
            ->assertJsonPath('trip', null);

        $this->actingAs($rider)
            ->getJson('/api/trips/current')
            ->assertOk()
            ->assertJsonPath('is_online', false)
            ->assertJsonPath('trip', null);
    }

    private function createTrip(User $passenger, ?User $rider, string $status): Trip
    {
        return Trip::create([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider?->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'pickup_location' => 'Pickup',
            'landmark_note' => 'Wait outside the main gate',
            'destination_location' => 'Destination',
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => $status,
        ]);
    }
}
