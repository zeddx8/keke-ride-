<?php

namespace Tests\Feature;

use App\Events\RiderLocationUpdated;
use App\Models\RiderLocation;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class RiderLocationTrackingTest extends TestCase
{
    use RefreshDatabase;

    public function test_assigned_rider_location_is_saved_and_broadcast_to_the_trip_channel(): void
    {
        Event::fake([RiderLocationUpdated::class]);

        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        $trip = Trip::create([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => 'accepted',
        ]);

        $this->actingAs($rider)
            ->postJson('/api/rider/location', [
                'latitude' => 5.12345678,
                'longitude' => -1.23456789,
            ])
            ->assertOk()
            ->assertJsonPath('message', 'Location updated.');

        $location = RiderLocation::query()->where('rider_id', $rider->id)->firstOrFail();
        $this->assertEqualsWithDelta(5.12345678, (float) $location->latitude, 0.00000001);
        $this->assertEqualsWithDelta(-1.23456789, (float) $location->longitude, 0.00000001);
        $this->assertEquals(1, (int) $location->is_online);

        Event::assertDispatched(RiderLocationUpdated::class, function (RiderLocationUpdated $event) use ($trip) {
            return $event->broadcastWith()['trip_id'] === $trip->id
                && $event->broadcastWith()['lat'] === 5.12345678
                && $event->broadcastWith()['lng'] === -1.23456789
                && $event->broadcastOn()[0]->name === 'private-trip.'.$trip->id;
        });
    }

    public function test_location_updates_require_an_active_trip_and_valid_coordinates(): void
    {
        $rider = User::factory()->create(['role' => 'rider', 'status' => 'offline']);

        $this->actingAs($rider)
            ->postJson('/api/rider/location', [
                'latitude' => 91,
                'longitude' => 0,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('latitude');

        $this->actingAs($rider)
            ->postJson('/api/rider/location', [
                'latitude' => 5.1,
                'longitude' => -1.2,
            ])
            ->assertStatus(409);

        $this->assertDatabaseCount('rider_locations', 0);
    }

    public function test_online_rider_location_is_saved_without_an_active_trip(): void
    {
        $rider = User::factory()->create(['role' => 'rider', 'status' => 'active']);

        $this->actingAs($rider)
            ->postJson('/api/rider/location', [
                'latitude' => 5.1,
                'longitude' => -1.2,
            ])
            ->assertOk()
            ->assertJsonPath('message', 'Location updated.');

        $this->assertDatabaseHas('rider_locations', [
            'rider_id' => $rider->id,
            'is_online' => true,
        ]);
    }

    public function test_going_offline_marks_saved_location_unavailable_to_dispatch(): void
    {
        $rider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        $location = RiderLocation::create([
            'rider_id' => $rider->id,
            'latitude' => 5.1,
            'longitude' => -1.2,
            'is_online' => true,
        ]);
        $originalUpdatedAt = $location->updated_at;

        $this->actingAs($rider)
            ->postJson('/api/rider/status', ['status' => 'offline'])
            ->assertOk();

        $location->refresh();
        $this->assertFalse((bool) $location->is_online);
        $this->assertEquals($originalUpdatedAt->timestamp, $location->updated_at->timestamp);
    }

    public function test_passengers_cannot_submit_rider_location_updates(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->postJson('/api/rider/location', [
                'latitude' => 5.1,
                'longitude' => -1.2,
            ])
            ->assertForbidden();
    }
}
