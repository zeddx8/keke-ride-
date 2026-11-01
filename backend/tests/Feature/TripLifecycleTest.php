<?php

namespace Tests\Feature;

use App\Events\TripStatusUpdated;
use App\Jobs\DispatchRideJob;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class TripLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_assigned_rider_can_advance_trip_and_passenger_updates_are_broadcast(): void
    {
        Event::fake([TripStatusUpdated::class]);

        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($passenger, $rider, 'accepted');

        foreach (['arrived', 'started', 'completed'] as $status) {
            $this->actingAs($rider)
                ->postJson("/api/trips/{$trip->id}/status", ['status' => $status])
                ->assertOk()
                ->assertJsonPath('status', $status);
        }

        $this->assertDatabaseHas('trips', [
            'id' => $trip->id,
            'rider_id' => $rider->id,
            'status' => 'completed',
        ]);
        $this->assertNotNull($trip->fresh()->completed_at);
        Event::assertDispatchedTimes(TripStatusUpdated::class, 3);
    }

    public function test_only_assigned_rider_can_advance_a_trip(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $assignedRider = User::factory()->create(['role' => 'rider']);
        $otherRider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($passenger, $assignedRider, 'accepted');

        $this->actingAs($otherRider)
            ->postJson("/api/trips/{$trip->id}/status", ['status' => 'arrived'])
            ->assertForbidden();

        $this->assertDatabaseHas('trips', [
            'id' => $trip->id,
            'status' => 'accepted',
        ]);
    }

    public function test_trip_status_must_advance_in_order(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($passenger, $rider, 'accepted');

        $this->actingAs($rider)
            ->postJson("/api/trips/{$trip->id}/status", ['status' => 'started'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->assertDatabaseHas('trips', [
            'id' => $trip->id,
            'status' => 'accepted',
        ]);
    }

    public function test_passenger_can_cancel_a_searching_trip_and_passenger_is_notified(): void
    {
        Event::fake([TripStatusUpdated::class]);

        $passenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createSearchingTrip($passenger);

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$trip->id}/cancel")
            ->assertOk()
            ->assertJsonPath('status', 'cancelled');

        $this->assertDatabaseHas('trips', [
            'id' => $trip->id,
            'status' => 'cancelled',
        ]);
        Event::assertDispatched(TripStatusUpdated::class, function (TripStatusUpdated $event) use ($trip) {
            return $event->trip->id === $trip->id
                && $event->broadcastWith()['trip']['status'] === 'cancelled'
                && $event->broadcastWith()['trip']['message'] === 'Ride request cancelled.';
        });
    }

    public function test_passenger_cannot_cancel_another_passengers_trip_or_a_trip_already_accepted(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $otherPassenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $searchingTrip = $this->createSearchingTrip($otherPassenger);
        $acceptedTrip = $this->createTrip($passenger, $rider, 'accepted');

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$searchingTrip->id}/cancel")
            ->assertForbidden();

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$acceptedTrip->id}/cancel")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('trip');

        $this->assertDatabaseHas('trips', [
            'id' => $searchingTrip->id,
            'status' => 'searching',
        ]);
        $this->assertDatabaseHas('trips', [
            'id' => $acceptedTrip->id,
            'status' => 'accepted',
        ]);
    }

    public function test_dispatch_notifies_passenger_when_no_riders_accept(): void
    {
        Event::fake([TripStatusUpdated::class]);

        $passenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createSearchingTrip($passenger);

        (new DispatchRideJob($trip, []))->handle();

        $this->assertDatabaseHas('trips', [
            'id' => $trip->id,
            'status' => 'cancelled',
        ]);
        Event::assertDispatched(TripStatusUpdated::class, function (TripStatusUpdated $event) use ($trip) {
            return $event->trip->id === $trip->id
                && $event->broadcastWith()['trip']['message'] === 'No riders accepted your request. Please try again.';
        });
    }

    private function createTrip(User $passenger, User $rider, string $status): Trip
    {
        return Trip::create([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => $status,
        ]);
    }

    private function createSearchingTrip(User $passenger): Trip
    {
        return Trip::create([
            'passenger_id' => $passenger->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => 'searching',
        ]);
    }
}
