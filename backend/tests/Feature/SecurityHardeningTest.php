<?php

namespace Tests\Feature;

use App\Models\RiderProfile;
use App\Models\Trip;
use App\Models\User;
use App\Services\TripRoutingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_cannot_modify_phone_directly_via_settings(): void
    {
        $user = User::factory()->create([
            'phone' => '0241000001',
            'role' => 'passenger',
        ]);

        $response = $this->actingAs($user)->patchJson('/api/settings', [
            'phone' => '0249999999',
            'first_name' => 'John',
        ]);

        $response->assertStatus(422);
        $this->assertEquals('0241000001', $user->fresh()->phone);
    }

    public function test_non_admin_cannot_access_admin_endpoints(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);

        $this->actingAs($passenger)
            ->getJson('/api/admin/overview')
            ->assertForbidden();

        $this->actingAs($rider)
            ->getJson('/api/admin/overview')
            ->assertForbidden();
    }

    public function test_passenger_cannot_create_multiple_concurrent_trips(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);

        Trip::create([
            'passenger_id' => $passenger->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => 'searching',
            'destination_location' => 'CCTU',
        ]);

        $this->mock(TripRoutingService::class, function ($mock) {
            $mock->shouldReceive('route')->andReturn([
                'distance_km' => 3.0,
                'duration_minutes' => 10,
                'geometry' => [[-1.2, 5.1], [-1.25, 5.11]],
            ]);
        });

        $response = $this->actingAs($passenger)->postJson('/api/trips', [
            'pickup_lat' => 5.1,
            'pickup_lng' => -1.2,
            'destination_lat' => 5.11,
            'destination_lng' => -1.25,
            'destination_location' => 'Market',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['trip']);
    }

    public function test_rider_cannot_accept_multiple_trips_simultaneously(): void
    {
        $rider = User::factory()->create(['role' => 'rider']);
        RiderProfile::create([
            'user_id' => $rider->id,
            'name' => 'Active Rider',
            'license_number' => 'DL999',
            'ghana_card_number' => 'GHA999',
            'plate_number' => 'CR-999-24',
            'verification_status' => 'approved',
        ]);

        $passengerA = User::factory()->create(['role' => 'passenger']);
        $passengerB = User::factory()->create(['role' => 'passenger']);

        // First trip already accepted by this rider
        Trip::create([
            'passenger_id' => $passengerA->id,
            'rider_id' => $rider->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => 'accepted',
            'destination_location' => 'Place A',
        ]);

        // Second trip is searching
        $tripB = Trip::create([
            'passenger_id' => $passengerB->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'estimated_distance_km' => 3.0,
            'estimated_fare' => 15.00,
            'status' => 'searching',
            'destination_location' => 'Place B',
        ]);

        // Rider attempts to accept Trip B while Trip A is in progress
        $response = $this->actingAs($rider)->postJson("/api/trips/{$tripB->id}/accept");

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['trip']);
    }
}
