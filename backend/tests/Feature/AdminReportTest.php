<?php

namespace Tests\Feature;

use App\Models\Trip;
use App\Models\TripIncident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_operations_can_view_filtered_trip_rider_and_incident_metrics(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations']);
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $start = now()->subDays(2)->startOfDay();
        $end = now()->subDay()->endOfDay();

        $completed = $this->createTrip($passenger, $rider, 'completed', $start->copy()->addHours(1));
        $completed->update([
            'completed_at' => $start->copy()->addHours(1)->addMinutes(20),
            'estimated_fare' => 12.5,
        ]);
        $this->createTrip($passenger, $rider, 'cancelled', $start->copy()->addHours(2));
        $this->createTrip($passenger, null, 'searching', $end->copy()->subHours(1));
        $this->createTrip($passenger, $rider, 'completed', $start->copy()->subDay());

        $resolved = TripIncident::query()->create([
            'trip_id' => $completed->id,
            'created_by' => $passenger->id,
            'category' => 'safety',
            'summary' => 'Safety report',
            'status' => 'resolved',
            'resolved_at' => $start->copy()->addHours(3)->addMinutes(30),
            'first_response_at' => $start->copy()->addHours(3)->addMinutes(15),
        ]);
        $resolved->forceFill([
            'created_at' => $start->copy()->addHours(3),
            'updated_at' => $end,
        ])->save();
        TripIncident::query()->create([
            'trip_id' => $completed->id,
            'created_by' => $passenger->id,
            'category' => 'payment',
            'summary' => 'Payment report',
            'status' => 'open',
        ])->forceFill([
            'created_at' => $start->copy()->addHours(4),
            'updated_at' => $start->copy()->addHours(4),
        ])->save();
        TripIncident::query()->create([
            'trip_id' => $completed->id,
            'created_by' => $passenger->id,
            'category' => 'other',
            'summary' => 'Outside date range',
            'status' => 'open',
        ])->forceFill([
            'created_at' => $start->copy()->subDay(),
            'updated_at' => $start->copy()->subDay(),
        ])->save();

        $this->actingAs($admin)
            ->getJson('/api/admin/reports?start_date='.$start->toDateString().'&end_date='.$end->toDateString())
            ->assertOk()
            ->assertJsonPath('trips.total', 3)
            ->assertJsonPath('trips.completed', 1)
            ->assertJsonPath('trips.cancelled', 1)
            ->assertJsonPath('trips.completion_rate', 33.3)
            ->assertJsonPath('trips.estimated_completed_fares', 12.5)
            ->assertJsonPath('trips.by_status.searching', 1)
            ->assertJsonPath('rider_activity.0.rider_id', $rider->id)
            ->assertJsonPath('rider_activity.0.trips', 2)
            ->assertJsonPath('rider_activity.0.completed_trips', 1)
            ->assertJsonPath('incidents.total', 2)
            ->assertJsonPath('incidents.open', 1)
            ->assertJsonPath('incidents.resolved', 1)
            ->assertJsonPath('incidents.unassigned_open', 1)
            ->assertJsonPath('incidents.overdue_open', 1)
            ->assertJsonPath('incidents.average_first_response_minutes', 15)
            ->assertJsonPath('incidents.average_resolution_minutes', 30)
            ->assertJsonPath('incidents.by_category.safety', 1);

        $this->assertNotNull($resolved->fresh()->resolved_at);
    }

    public function test_report_dates_default_to_thirty_days_and_invalid_or_excessive_ranges_are_rejected(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations']);

        $this->actingAs($admin)
            ->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonPath('start_date', now()->subDays(29)->toDateString())
            ->assertJsonPath('end_date', now()->toDateString());

        $this->getJson('/api/admin/reports?start_date=2026-02-02&end_date=2026-02-01')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_date', 'end_date']);

        $this->getJson('/api/admin/reports?start_date=2024-01-01&end_date=2026-01-01')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('end_date');
    }

    public function test_operations_can_export_aggregate_csv_without_personal_contact_details(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations']);
        $passenger = User::factory()->create(['role' => 'passenger', 'phone' => '0245551234']);
        $rider = User::factory()->create(['role' => 'rider', 'phone' => '0245555678']);
        $this->createTrip($passenger, $rider, 'completed', now()->subDay());

        $response = $this->actingAs($admin)
            ->get('/api/admin/reports/export?start_date='.now()->subDays(2)->toDateString().'&end_date='.now()->toDateString());

        $response->assertOk()
            ->assertHeader('content-type', 'text/csv; charset=UTF-8')
            ->assertHeader('content-disposition', 'attachment; filename=keke-ride-report-'.now()->subDays(2)->toDateString().'-'.now()->toDateString().'.csv');
        $csv = $response->streamedContent();
        $this->assertStringContainsString('Completion rate (%)', $csv);
        $this->assertStringContainsString('Rider activity', $csv);
        $this->assertStringContainsString('Unassigned open incidents', $csv);
        $this->assertStringContainsString('Overdue open incidents', $csv);
        $this->assertStringContainsString('Average first response time (minutes)', $csv);
        $this->assertStringNotContainsString($passenger->phone, $csv);
        $this->assertStringNotContainsString($rider->phone, $csv);
    }

    public function test_support_and_non_admin_users_cannot_read_or_export_reports(): void
    {
        $support = User::factory()->create(['role' => 'admin', 'admin_role' => 'support']);
        $this->actingAs($support)
            ->getJson('/api/admin/reports')
            ->assertForbidden();
        $this->get('/api/admin/reports/export')->assertForbidden();

        $passenger = User::factory()->create(['role' => 'passenger']);
        $this->actingAs($passenger)
            ->getJson('/api/admin/reports')
            ->assertForbidden();
    }

    private function createTrip(User $passenger, ?User $rider, string $status, $createdAt): Trip
    {
        $trip = Trip::query()->create([
            'passenger_id' => $passenger->id,
            'rider_id' => $rider?->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'pickup_location' => 'Station',
            'destination_location' => 'Market',
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 10.0,
            'status' => $status,
        ]);
        $trip->forceFill([
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ])->save();

        return $trip;
    }
}
