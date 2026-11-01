<?php

namespace Tests\Feature;

use App\Models\Trip;
use App\Models\User;
use App\Services\TripRoutingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RiderDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_rider_summary_counts_completed_trips_for_today_and_this_week(): void
    {
        $rider = User::factory()->create(['role' => 'rider']);
        $otherRider = User::factory()->create(['role' => 'rider']);

        $this->createTrip($rider, 'completed', now(), 12.50, 3.25);
        $this->createTrip($rider, 'completed', now()->subDays(2), 20, 5);
        $this->createTrip($rider, 'completed', now()->subWeeks(2), 30, 8);
        $this->createTrip($rider, 'started', now(), 99, 20);
        $this->createTrip($otherRider, 'completed', now(), 50, 10);

        $this->actingAs($rider)
            ->getJson('/api/rider/summary')
            ->assertOk()
            ->assertJson([
                'trips_today' => 1,
                'trips_this_week' => 2,
                'estimated_fares_today' => 12.5,
                'estimated_fares_this_week' => 32.5,
                'distance_today_km' => 3.25,
                'distance_this_week_km' => 8.25,
            ]);
    }

    public function test_only_riders_can_view_rider_summary(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->getJson('/api/rider/summary')
            ->assertForbidden();
    }

    public function test_navigation_routes_assigned_rider_to_pickup_until_trip_starts(): void
    {
        $rider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($rider, 'accepted', now(), 12.50, 3.25);

        $this->mock(TripRoutingService::class, function ($mock) {
            $mock->shouldReceive('route')
                ->once()
                ->with(5.1, -1.2, 5.1, -1.24)
                ->andReturn([
                    'distance_km' => 1.4,
                    'duration_minutes' => 4.2,
                    'geometry' => [[-1.2, 5.1], [-1.24, 5.1]],
                ]);
        });

        $this->actingAs($rider)
            ->getJson("/api/trips/{$trip->id}/navigation?latitude=5.1&longitude=-1.2")
            ->assertOk()
            ->assertJsonPath('target', 'pickup')
            ->assertJsonPath('distance_km', 1.4)
            ->assertJsonPath('duration_minutes', 4.2);
    }

    public function test_navigation_routes_to_destination_only_after_trip_starts(): void
    {
        $rider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($rider, 'started', now(), 12.50, 3.25);

        $this->mock(TripRoutingService::class, function ($mock) {
            $mock->shouldReceive('route')
                ->once()
                ->with(5.1, -1.2, 5.11, -1.25)
                ->andReturn([
                    'distance_km' => 2.1,
                    'duration_minutes' => 7.5,
                    'geometry' => [[-1.2, 5.1], [-1.25, 5.11]],
                ]);
        });

        $this->actingAs($rider)
            ->getJson("/api/trips/{$trip->id}/navigation?latitude=5.1&longitude=-1.2")
            ->assertOk()
            ->assertJsonPath('target', 'destination');
    }

    public function test_rider_cannot_get_navigation_for_another_riders_trip(): void
    {
        $rider = User::factory()->create(['role' => 'rider']);
        $otherRider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($otherRider, 'accepted', now(), 12.50, 3.25);

        $this->actingAs($rider)
            ->getJson("/api/trips/{$trip->id}/navigation?latitude=5.1&longitude=-1.2")
            ->assertForbidden();
    }

    private function createTrip(
        User $rider,
        string $status,
        mixed $completedAt,
        float $fare,
        float $distance,
    ): Trip {
        $passenger = User::factory()->create(['role' => 'passenger']);

        return Trip::create([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'pickup_location' => 'Pickup',
            'destination_location' => 'Destination',
            'estimated_distance_km' => $distance,
            'estimated_fare' => $fare,
            'status' => $status,
            'completed_at' => $status === 'completed' ? $completedAt : null,
        ]);
    }
}
