<?php

namespace Tests\Feature;

use App\Models\Trip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TripIncidentReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_passenger_and_rider_can_report_issues_on_their_own_trips(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($passenger, $rider);

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$trip->id}/incidents", [
                'category' => 'safety',
                'summary' => 'Pickup safety concern',
                'details' => 'I felt unsafe while waiting at the pickup location.',
            ])
            ->assertCreated()
            ->assertJsonPath('message', 'Your report was received. Our team will follow up.');

        $this->actingAs($rider)
            ->postJson("/api/trips/{$trip->id}/incidents", [
                'category' => 'service',
                'summary' => 'Pickup location issue',
                'details' => 'The pickup location details were unclear.',
            ])
            ->assertCreated();

        $this->assertDatabaseCount('trip_incidents', 2);
        $this->assertDatabaseHas('trip_incidents', [
            'trip_id' => $trip->id,
            'created_by' => $passenger->id,
            'category' => 'safety',
            'status' => 'open',
        ]);
        $this->assertDatabaseHas('trip_incident_notes', [
            'created_by' => $rider->id,
            'body' => 'The pickup location details were unclear.',
        ]);

        $admin = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin)
            ->getJson('/api/admin/incidents?status=open')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.trip_id', $trip->id);
    }

    public function test_users_cannot_report_issues_against_trips_they_do_not_participate_in(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($passenger, $rider);
        $otherPassenger = User::factory()->create(['role' => 'passenger']);
        $admin = User::factory()->create(['role' => 'admin']);
        $payload = [
            'category' => 'other',
            'summary' => 'A report',
            'details' => 'Details for the report.',
        ];

        $this->actingAs($otherPassenger)
            ->postJson("/api/trips/{$trip->id}/incidents", $payload)
            ->assertNotFound();

        $this->actingAs($admin)
            ->postJson("/api/trips/{$trip->id}/incidents", $payload)
            ->assertForbidden();

        $this->assertDatabaseCount('trip_incidents', 0);
    }

    public function test_trip_issue_report_validates_category_and_required_fields(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createTrip($passenger, User::factory()->create(['role' => 'rider']));

        $this->actingAs($passenger)
            ->postJson("/api/trips/{$trip->id}/incidents", [
                'category' => 'unknown',
                'summary' => '',
                'details' => '',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['category', 'summary', 'details']);

        $this->assertDatabaseCount('trip_incidents', 0);
    }

    private function createTrip(User $passenger, User $rider): Trip
    {
        return Trip::create([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'pickup_location' => 'Station',
            'destination_location' => 'Market',
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => 'completed',
        ]);
    }
}
