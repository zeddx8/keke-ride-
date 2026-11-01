<?php

namespace Tests\Feature;

use App\Models\Trip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TripSharingTest extends TestCase
{
    use RefreshDatabase;

    public function test_passenger_can_create_and_revoke_a_live_share(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createTrip($passenger, 'accepted');

        $createResponse = $this->actingAs($passenger)
            ->postJson("/api/trips/{$trip->id}/share")
            ->assertCreated()
            ->assertJsonStructure(['token', 'expires_at']);

        $token = $createResponse->json('token');
        $this->assertDatabaseHas('trips', [
            'id' => $trip->id,
            'share_token' => hash('sha256', $token),
        ]);

        $this->actingAs($passenger)
            ->deleteJson("/api/trips/{$trip->id}/share")
            ->assertOk();

        $this->getJson("/api/trip-share/{$token}")
            ->assertNotFound();
    }

    public function test_another_passenger_cannot_create_or_revoke_a_share(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $otherPassenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createTrip($passenger, 'accepted');

        $this->actingAs($otherPassenger)
            ->postJson("/api/trips/{$trip->id}/share")
            ->assertForbidden();

        $this->actingAs($otherPassenger)
            ->deleteJson("/api/trips/{$trip->id}/share")
            ->assertForbidden();
    }

    public function test_public_share_is_read_only_and_excludes_identity_fields(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($passenger, 'started', $rider);
        $token = bin2hex(random_bytes(32));
        $trip->update([
            'share_token' => hash('sha256', $token),
            'share_expires_at' => now()->addHours(12),
        ]);

        $response = $this->getJson("/api/trip-share/{$token}")
            ->assertOk()
            ->assertJsonPath('trip.status', 'started')
            ->assertJsonPath('trip.pickup.label', 'Airport Road')
            ->assertJsonPath('trip.destination.label', 'Central Market');

        $response->assertJsonMissing([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'phone' => $passenger->phone,
        ]);
    }

    public function test_expired_share_returns_gone_and_is_cleared(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createTrip($passenger, 'accepted');
        $token = bin2hex(random_bytes(32));
        $trip->update([
            'share_token' => hash('sha256', $token),
            'share_expires_at' => now()->subMinute(),
        ]);

        $this->getJson("/api/trip-share/{$token}")
            ->assertStatus(410);

        $this->assertDatabaseHas('trips', [
            'id' => $trip->id,
            'share_token' => null,
            'share_expires_at' => null,
        ]);
    }

    public function test_terminal_trip_cannot_create_a_new_share(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createTrip($passenger, 'completed');

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$trip->id}/share")
            ->assertUnprocessable();
    }

    private function createTrip(User $passenger, string $status, ?User $rider = null): Trip
    {
        return Trip::create([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider?->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'pickup_location' => 'Airport Road',
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'destination_location' => 'Central Market',
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => $status,
        ]);
    }
}
