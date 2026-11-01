<?php

namespace Tests\Feature;

use App\Models\Trip;
use App\Models\TripRating;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TripRatingTest extends TestCase
{
    use RefreshDatabase;

    public function test_passenger_can_rate_their_completed_trip_once(): void
    {
        [$passenger, $rider, $trip] = $this->createCompletedTrip();

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$trip->id}/rating", [
                'rating' => 5,
                'comment' => 'Friendly and on time.',
            ])
            ->assertCreated()
            ->assertJsonPath('trip_id', $trip->id)
            ->assertJsonPath('rating', 5)
            ->assertJsonPath('comment', 'Friendly and on time.');

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$trip->id}/rating", ['rating' => 4])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rating');

        $this->assertDatabaseCount('trip_ratings', 1);
        $this->assertDatabaseHas('trip_ratings', [
            'trip_id' => $trip->id,
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'rating' => 5,
            'comment' => 'Friendly and on time.',
        ]);
    }

    public function test_only_the_trip_passenger_can_rate_and_only_after_completion(): void
    {
        [$passenger, , $trip] = $this->createCompletedTrip();
        $otherPassenger = User::factory()->create(['role' => 'passenger']);
        $startedRider = User::factory()->create(['role' => 'rider']);
        $startedTrip = $this->createTrip($passenger, $startedRider, 'started');

        $this->actingAs($otherPassenger)
            ->postJson("/api/trips/{$trip->id}/rating", ['rating' => 5])
            ->assertForbidden();

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$startedTrip->id}/rating", ['rating' => 5])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('trip');

        $this->assertDatabaseCount('trip_ratings', 0);
    }

    public function test_riders_cannot_submit_ratings_and_rating_value_must_be_between_one_and_five(): void
    {
        [$passenger, $rider, $trip] = $this->createCompletedTrip();

        $this->actingAs($rider)
            ->postJson("/api/trips/{$trip->id}/rating", ['rating' => 5])
            ->assertForbidden();

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$trip->id}/rating", ['rating' => 6])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rating');

        $this->assertDatabaseCount('trip_ratings', 0);
    }

    public function test_rider_can_view_average_and_count_of_received_ratings(): void
    {
        [$passenger, $rider, $firstTrip] = $this->createCompletedTrip();
        $secondTrip = $this->createTrip(
            User::factory()->create(['role' => 'passenger']),
            $rider,
            'completed',
        );
        TripRating::create([
            'trip_id' => $firstTrip->id,
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'rating' => 5,
        ]);
        TripRating::create([
            'trip_id' => $secondTrip->id,
            'passenger_id' => $secondTrip->passenger_id,
            'rider_id' => $rider->id,
            'rating' => 3,
        ]);

        $this->actingAs($rider)
            ->getJson('/api/rider/ratings')
            ->assertOk()
            ->assertJsonPath('average_rating', 4)
            ->assertJsonPath('ratings_count', 2);
    }

    public function test_rider_rating_summary_is_private_to_rider_accounts(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->getJson('/api/rider/ratings')
            ->assertForbidden();
    }

    public function test_passenger_history_contains_rating_status_for_completed_trips(): void
    {
        [$passenger, $rider, $trip] = $this->createCompletedTrip();
        TripRating::create([
            'trip_id' => $trip->id,
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'rating' => 4,
            'comment' => 'Good ride.',
        ]);

        $this->actingAs($passenger)
            ->getJson('/api/trips/history')
            ->assertOk()
            ->assertJsonPath('data.0.rider_id', $rider->id)
            ->assertJsonPath('data.0.rating.rating', 4)
            ->assertJsonPath('data.0.rating.comment', 'Good ride.');
    }

    private function createCompletedTrip(): array
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($passenger, $rider, 'completed');

        return [$passenger, $rider, $trip];
    }

    private function createTrip(User $passenger, User $rider, string $status): Trip
    {
        return Trip::create([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'pickup_location' => 'Pickup',
            'destination_location' => 'Destination',
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => $status,
        ]);
    }
}
