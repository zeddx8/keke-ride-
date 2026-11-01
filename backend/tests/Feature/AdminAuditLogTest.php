<?php

namespace Tests\Feature;

use App\Models\RiderProfile;
use App\Models\Trip;
use App\Models\TripIncident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminAuditLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_actions_are_recorded_and_filterable_without_sensitive_notes(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'name' => 'Operations Admin']);
        $rider = User::factory()->create(['role' => 'rider']);
        $passenger = User::factory()->create(['role' => 'passenger']);
        $profile = RiderProfile::create([
            'user_id' => $rider->id,
            'name' => 'Rider Profile',
            'license_number' => 'DL-123',
            'ghana_card_number' => 'GHA-123',
            'plate_number' => 'CR-123-24',
            'license_image_path' => 'profiles/license.jpg',
            'ghana_card_image_path' => 'profiles/card.jpg',
            'verification_status' => 'pending',
        ]);
        $trip = $this->createTrip($passenger, $rider);

        $this->actingAs($admin)
            ->postJson('/api/admin/users', [
                'phone' => '0245557788',
                'role' => 'passenger',
            ])
            ->assertCreated();

        $this->actingAs($admin)
            ->postJson("/api/admin/riders/{$rider->id}/review", ['status' => 'approved'])
            ->assertOk();

        $this->actingAs($admin)
            ->postJson('/api/admin/incidents', [
                'trip_id' => $trip->id,
                'category' => 'service',
                'summary' => 'Pickup issue',
                'details' => 'Private notes about the follow-up.',
            ])
            ->assertCreated();
        $incidentId = TripIncident::query()->value('id');

        $this->actingAs($admin)
            ->postJson("/api/admin/incidents/{$incidentId}/notes", [
                'body' => 'Another private internal note.',
            ])
            ->assertOk();

        $this->actingAs($admin)
            ->postJson("/api/admin/incidents/{$incidentId}/resolve", [
                'reporter_message' => 'We reviewed your report and followed up.',
            ])
            ->assertOk();

        $this->assertDatabaseCount('admin_audit_logs', 5);
        $this->actingAs($admin)
            ->getJson('/api/admin/audit-logs')
            ->assertOk()
            ->assertJsonPath('total', 5)
            ->assertJsonPath('data.0.actor', 'Operations Admin')
            ->assertJsonPath('data.0.action', 'incident.resolved')
            ->assertJsonPath('data.0.subject_type', 'trip_incident')
            ->assertJsonPath('data.0.subject_id', $incidentId)
            ->assertJsonPath('data.0.summary', "Resolved incident #{$incidentId}.")
            ->assertDontSee('Private notes about the follow-up.')
            ->assertDontSee('Another private internal note.');

        $this->actingAs($admin)
            ->getJson('/api/admin/audit-logs?action=rider.approved')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.action', 'rider.approved')
            ->assertJsonPath('data.0.subject_id', $profile->id);

        $createdUserId = User::query()->where('phone', '0245557788')->value('id');
        $this->assertDatabaseHas('admin_audit_logs', [
            'action' => 'account.created',
            'subject_type' => 'user',
            'subject_id' => $createdUserId,
            'summary' => "Created passenger account #{$createdUserId}.",
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'action' => 'incident.note_added',
            'summary' => "Added a follow-up note to incident #{$incidentId}.",
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'action' => 'incident.created',
            'summary' => "Opened incident #{$incidentId} for trip #{$trip->id}.",
        ]);
    }

    public function test_only_admins_can_read_audit_logs_and_filters_are_validated(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $this->actingAs($passenger)
            ->getJson('/api/admin/audit-logs')
            ->assertForbidden();

        $admin = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin)
            ->getJson('/api/admin/audit-logs?action=unknown')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('action');
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
