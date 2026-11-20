<?php

namespace Tests\Feature;

use App\Models\RiderLocation;
use App\Models\RiderProfile;
use App\Models\Trip;
use App\Models\User;
use App\Services\TripRoutingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class TripDispatchTest extends TestCase
{
    use RefreshDatabase;

    public function test_passenger_can_request_a_ride_with_pickup_instructions(): void
    {
        Queue::fake();
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        RiderProfile::create([
            'user_id' => $rider->id,
            'name' => 'Approved Rider',
            'license_number' => 'DL123',
            'ghana_card_number' => 'GHA123',
            'plate_number' => 'CR-123-24',
            'license_image_path' => 'license.jpg',
            'ghana_card_image_path' => 'card.jpg',
            'verification_status' => 'approved',
        ]);
        RiderLocation::create([
            'rider_id' => $rider->id,
            'latitude' => 5.1,
            'longitude' => -1.2,
            'is_online' => true,
        ]);

        $this->mock(TripRoutingService::class, function ($mock) {
            $mock->shouldReceive('route')
                ->once()
                ->andReturn([
                    'distance_km' => 2.5,
                    'duration_minutes' => 8,
                    'geometry' => [[-1.2, 5.1], [-1.25, 5.11]],
                ]);
        });

        $response = $this->actingAs($passenger)
            ->postJson('/api/trips', [
                'pickup_lat' => 5.1,
                'pickup_lng' => -1.2,
                'pickup_location' => 'Cape Coast Central',
                'landmark_note' => 'Wait by the pharmacy entrance',
                'destination_lat' => 5.11,
                'destination_lng' => -1.25,
                'destination_location' => 'CCTU',
            ])
            ->assertCreated()
            ->assertJsonPath('status', 'searching');

        $this->assertDatabaseHas('trips', [
            'id' => $response->json('id'),
            'landmark_note' => 'Wait by the pharmacy entrance',
            'payment_method' => 'cash',
        ]);
    }

    public function test_unverified_rider_cannot_go_online()
    {
        $rider = User::factory()->create(['role' => 'rider']);
        RiderProfile::create([
            'user_id' => $rider->id,
            'name' => 'Test Rider',
            'license_number' => 'DL1',
            'ghana_card_number' => 'GHA1',
            'plate_number' => 'CR-001',
            'verification_status' => 'pending', // Not approved
        ]);

        $response = $this->actingAs($rider)->postJson('/api/rider/status', [
            'is_online' => true,
        ]);

        $response->assertStatus(403)
            ->assertJson(['message' => 'Your account must be approved before you can go online.']);
    }

    public function test_rider_only_receives_the_dispatch_attempt_assigned_to_them(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $assignedRider = User::factory()->create(['role' => 'rider']);
        $otherRider = User::factory()->create(['role' => 'rider']);

        $trip = Trip::create([
            'passenger_id' => $passenger->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => 'searching',
            'pickup_location' => 'Cape Coast Central',
            'destination_location' => 'CCTU',
            'dispatch_rider_id' => $assignedRider->id,
            'dispatch_expires_at' => now()->addSeconds(20),
        ]);

        $this->actingAs($assignedRider)
            ->getJson('/api/rider/incoming')
            ->assertOk()
            ->assertJsonPath('trip.trip_id', $trip->id);

        $this->actingAs($otherRider)
            ->getJson('/api/rider/incoming')
            ->assertOk()
            ->assertJsonPath('trip', null);
    }

    public function test_race_condition_prevents_multiple_riders_accepting_same_trip()
    {
        Event::fake();
        $passenger = User::factory()->create(['role' => 'passenger']);

        $riderOne = User::factory()->create(['role' => 'rider']);
        RiderProfile::create([
            'user_id' => $riderOne->id,
            'name' => 'Rider One',
            'license_number' => 'DL1',
            'ghana_card_number' => 'GHA1',
            'plate_number' => 'CR-001',
            'verification_status' => 'approved',
        ]);

        $riderTwo = User::factory()->create(['role' => 'rider']);
        RiderProfile::create([
            'user_id' => $riderTwo->id,
            'name' => 'Rider Two',
            'license_number' => 'DL2',
            'ghana_card_number' => 'GHA2',
            'plate_number' => 'CR-002',
            'verification_status' => 'approved',
        ]);

        // Create initial trip
        $trip = Trip::create([
            'passenger_id' => $passenger->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => 'searching',
        ]);

        // Rider One accepts successfully
        $responseOne = $this->actingAs($riderOne)->postJson("/api/trips/{$trip->id}/accept");
        $responseOne->assertStatus(200);

        // Rider Two attempts to accept the exact same trip a millisecond later
        $responseTwo = $this->actingAs($riderTwo)->postJson("/api/trips/{$trip->id}/accept");
        $responseTwo->assertStatus(422)
            ->assertJsonValidationErrors(['trip']);

        // Verify database state is strictly assigned to Rider One
        $this->assertDatabaseHas('trips', [
            'id' => $trip->id,
            'rider_id' => $riderOne->id,
            'status' => 'accepted',
        ]);
    }
}
