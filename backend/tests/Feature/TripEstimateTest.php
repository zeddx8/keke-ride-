<?php

namespace Tests\Feature;

use App\Jobs\DispatchRideJob;
use App\Models\RiderLocation;
use App\Models\RiderProfile;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class TripEstimateTest extends TestCase
{
    use RefreshDatabase;

    public function test_passenger_receives_a_deterministic_distance_and_fare_estimate(): void
    {
        $this->fakeRoute();
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->postJson('/api/trips/estimate', [
                'pickup_lat' => 5.1,
                'pickup_lng' => -1.2,
                'destination_lat' => 5.11,
                'destination_lng' => -1.2,
            ])
            ->assertOk()
            ->assertJsonPath('estimated_distance_km', 2.4)
            ->assertJsonPath('estimated_fare', 12.2)
            ->assertJsonPath('duration_minutes', 6.5)
            ->assertJsonPath('route_geometry.0.0', -1.2)
            ->assertJsonPath('currency', 'GHS');
    }

    public function test_riders_cannot_request_passenger_trip_estimates(): void
    {
        $rider = User::factory()->create(['role' => 'rider']);

        $this->actingAs($rider)
            ->postJson('/api/trips/estimate', [
                'pickup_lat' => 5.1,
                'pickup_lng' => -1.2,
                'destination_lat' => 5.11,
                'destination_lng' => -1.2,
            ])
            ->assertForbidden();
    }

    public function test_estimate_rejects_invalid_or_identical_coordinates(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->postJson('/api/trips/estimate', [
                'pickup_lat' => 91,
                'pickup_lng' => -1.2,
                'destination_lat' => 5.11,
                'destination_lng' => -1.2,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('pickup_lat');

        $this->actingAs($passenger)
            ->postJson('/api/trips/estimate', [
                'pickup_lat' => 5.1,
                'pickup_lng' => -1.2,
                'destination_lat' => 5.1,
                'destination_lng' => -1.2,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('destination_lat');
    }

    public function test_trip_creation_uses_server_calculated_estimate_and_saves_destination_label(): void
    {
        $this->fakeRoute();
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->postJson('/api/trips', [
                'pickup_lat' => 5.1,
                'pickup_lng' => -1.2,
                'pickup_location' => 'My pickup',
                'destination_lat' => 5.11,
                'destination_lng' => -1.2,
                'destination_location' => 'Market',
                'estimated_fare' => 0.01,
                'estimated_distance_km' => 999,
            ])
            ->assertNotFound();

        $trip = Trip::query()->firstOrFail();
        $this->assertEquals(2.4, (float) $trip->estimated_distance_km);
        $this->assertEquals(12.2, (float) $trip->estimated_fare);
        $this->assertSame('My pickup', $trip->pickup_location);
        $this->assertSame('Market', $trip->destination_location);
        $this->assertSame([[-1.2, 5.1], [-1.2, 5.11]], $trip->route_geometry);
    }

    public function test_routing_provider_failure_is_returned_without_creating_a_trip(): void
    {
        Http::fake([
            'router.project-osrm.org/route/*' => Http::response([], 503),
        ]);
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->postJson('/api/trips/estimate', [
                'pickup_lat' => 5.1,
                'pickup_lng' => -1.2,
                'destination_lat' => 5.11,
                'destination_lng' => -1.2,
            ])
            ->assertStatus(503)
            ->assertJsonPath('message', 'Road routing is temporarily unavailable. Please try again.');

        $this->actingAs($passenger)
            ->postJson('/api/trips', [
                'pickup_lat' => 5.1,
                'pickup_lng' => -1.2,
                'destination_lat' => 5.11,
                'destination_lng' => -1.2,
                'destination_location' => 'Market',
            ])
            ->assertStatus(503);

        $this->assertSame(0, Trip::query()->count());
    }

    public function test_passenger_can_search_places_and_receives_coordinates(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/search*' => Http::response([
                [
                    'display_name' => 'Cape Coast, Ghana',
                    'lat' => '5.1053',
                    'lon' => '-1.2466',
                ],
            ]),
        ]);
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->getJson('/api/trips/places?q=Cape%20Coast')
            ->assertOk()
            ->assertJsonPath('results.0.label', 'Cape Coast, Ghana')
            ->assertJsonPath('results.0.latitude', 5.1053)
            ->assertJsonPath('results.0.longitude', -1.2466);
    }

    public function test_identical_route_requests_are_cached(): void
    {
        $this->fakeRoute();
        $passenger = User::factory()->create(['role' => 'passenger']);
        $coordinates = [
            'pickup_lat' => 5.1,
            'pickup_lng' => -1.2,
            'destination_lat' => 5.11,
            'destination_lng' => -1.2,
        ];

        $this->actingAs($passenger)->postJson('/api/trips/estimate', $coordinates)->assertOk();
        $this->actingAs($passenger)->postJson('/api/trips/estimate', $coordinates)->assertOk();

        Http::assertSentCount(1);
    }

    public function test_place_search_cache_avoids_repeating_provider_requests(): void
    {
        Cache::flush();
        Http::fake([
            'nominatim.openstreetmap.org/search*' => Http::response([
                ['display_name' => 'Cape Coast, Ghana', 'lat' => '5.1053', 'lon' => '-1.2466'],
            ]),
        ]);
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)->getJson('/api/trips/places?q=Cape%20Coast')->assertOk();
        $this->actingAs($passenger)->getJson('/api/trips/places?q=Cape%20Coast')->assertOk();

        Http::assertSentCount(1);
    }

    public function test_place_search_enforces_shared_provider_interval_and_returns_retry_after(): void
    {
        Cache::flush();
        Http::fake([
            'nominatim.openstreetmap.org/search*' => Http::response([]),
        ]);
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)->getJson('/api/trips/places?q=Cape%20Coast')->assertOk();
        $this->actingAs($passenger)
            ->getJson('/api/trips/places?q=Accra%20Ghana')
            ->assertStatus(429)
            ->assertHeader('Retry-After', '1');

        Http::assertSentCount(1);
    }

    public function test_ride_dispatch_orders_riders_by_fresh_proximity_and_keeps_others_as_fallbacks(): void
    {
        $this->fakeRoute();
        Queue::fake();

        $passenger = User::factory()->create(['role' => 'passenger']);
        $nearbyRider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        $fartherRider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        $staleRider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        $locationlessRider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        foreach ([$nearbyRider, $fartherRider, $staleRider, $locationlessRider] as $index => $rider) {
            RiderProfile::create([
                'user_id' => $rider->id,
                'name' => "Test Rider {$index}",
                'license_number' => "DL-{$index}",
                'ghana_card_number' => "GHA-{$index}",
                'plate_number' => "CR-00{$index}",
                'verification_status' => 'approved',
            ]);
        }

        RiderLocation::create([
            'rider_id' => $nearbyRider->id,
            'latitude' => 5.101,
            'longitude' => -1.2,
            'is_online' => true,
        ]);
        RiderLocation::create([
            'rider_id' => $fartherRider->id,
            'latitude' => 5.12,
            'longitude' => -1.2,
            'is_online' => true,
        ]);
        $staleLocation = RiderLocation::create([
            'rider_id' => $staleRider->id,
            'latitude' => 5.1001,
            'longitude' => -1.2,
            'is_online' => true,
        ]);
        RiderLocation::query()
            ->whereKey($staleLocation->id)
            ->update(['updated_at' => now()->subMinutes(10)]);

        $this->actingAs($passenger)
            ->postJson('/api/trips', [
                'pickup_lat' => 5.1,
                'pickup_lng' => -1.2,
                'destination_lat' => 5.11,
                'destination_lng' => -1.2,
                'destination_location' => 'Market',
            ])
            ->assertCreated();

        Queue::assertPushed(DispatchRideJob::class);
        $dispatch = Queue::pushed(DispatchRideJob::class)->first();
        $this->assertSame(
            [$nearbyRider->id, $fartherRider->id],
            array_slice($dispatch->riderIds, 0, 2),
        );
        $this->assertEqualsCanonicalizing(
            [$staleRider->id, $locationlessRider->id],
            array_slice($dispatch->riderIds, 2),
        );
    }

    /**
     * Fake OSRM's GeoJSON route response used by estimate and trip-creation tests.
     */
    private function fakeRoute(): void
    {
        Http::fake([
            'router.project-osrm.org/route/*' => Http::response([
                'code' => 'Ok',
                'routes' => [[
                    'distance' => 2400,
                    'duration' => 390,
                    'geometry' => [
                        'type' => 'LineString',
                        'coordinates' => [[-1.2, 5.1], [-1.2, 5.11]],
                    ],
                ]],
            ]),
        ]);
    }
}
