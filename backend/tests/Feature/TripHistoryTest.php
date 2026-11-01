<?php

namespace Tests\Feature;

use App\Models\Trip;
use App\Models\TripIncident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TripHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_passenger_sees_only_their_trips_with_route_and_fare_details(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $otherPassenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);

        $trip = $this->createTrip($passenger, $rider, [
            'status' => 'completed',
            'pickup_location' => 'Bus Station',
            'destination_location' => 'Central Market',
        ]);
        $this->createTrip($otherPassenger, $rider, ['status' => 'cancelled']);

        $this->actingAs($passenger)
            ->getJson('/api/trips/history')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $trip->id)
            ->assertJsonPath('data.0.status', 'completed')
            ->assertJsonPath('data.0.pickup_location', 'Bus Station')
            ->assertJsonPath('data.0.destination_location', 'Central Market')
            ->assertJsonPath('data.0.estimated_fare', '11.25')
            ->assertJsonPath('data.0.payment_method', 'cash')
            ->assertJsonPath('data.0.pickup_lat', 5.1)
            ->assertJsonPath('data.0.destination_lng', -1.25);
    }

    public function test_rider_sees_only_trips_assigned_to_them(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $otherRider = User::factory()->create(['role' => 'rider']);

        $trip = $this->createTrip($passenger, $rider, ['status' => 'completed']);
        $this->createTrip($passenger, $otherRider, ['status' => 'completed']);

        $this->actingAs($rider)
            ->getJson('/api/trips/history')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $trip->id);
    }

    public function test_trip_history_shows_reporter_only_incident_status_and_shared_resolution_message(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $otherPassenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createTrip($passenger, $rider, ['status' => 'completed']);
        $passengerIncident = TripIncident::query()->create([
            'trip_id' => $trip->id,
            'created_by' => $passenger->id,
            'category' => 'safety',
            'summary' => 'Pickup safety concern',
            'status' => 'resolved',
            'reporter_message' => 'We reviewed your report and followed up with the rider.',
            'resolved_at' => now(),
        ]);
        $passengerIncident->notes()->create([
            'created_by' => $passenger->id,
            'body' => 'Private details included in the initial report.',
        ]);
        TripIncident::query()->create([
            'trip_id' => $trip->id,
            'created_by' => $rider->id,
            'category' => 'service',
            'summary' => 'Rider report that is not for the passenger',
            'status' => 'open',
        ]);
        TripIncident::query()->create([
            'trip_id' => $trip->id,
            'created_by' => $otherPassenger->id,
            'category' => 'other',
            'summary' => 'Unrelated report',
            'status' => 'open',
        ]);

        $this->actingAs($passenger)
            ->getJson('/api/trips/history')
            ->assertOk()
            ->assertJsonCount(1, 'data.0.incidents')
            ->assertJsonPath('data.0.incidents.0.id', $passengerIncident->id)
            ->assertJsonPath('data.0.incidents.0.status', 'resolved')
            ->assertJsonPath('data.0.incidents.0.reporter_message', 'We reviewed your report and followed up with the rider.')
            ->assertJsonMissingPath('data.0.incidents.0.notes')
            ->assertDontSee('Private details included in the initial report.')
            ->assertDontSee('Rider report that is not for the passenger')
            ->assertDontSee('Unrelated report');
    }

    public function test_users_without_a_passenger_or_rider_role_cannot_view_trip_history(): void
    {
        $user = User::factory()->create(['role' => 'admin']);

        $this->actingAs($user)
            ->getJson('/api/trips/history')
            ->assertForbidden();
    }

    private function createTrip(User $passenger, User $rider, array $attributes = []): Trip
    {
        return Trip::create(array_merge([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'pickup_location' => 'Pickup',
            'destination_location' => 'Destination',
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'payment_method' => 'cash',
            'status' => 'completed',
        ], $attributes));
    }
}
