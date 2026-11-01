<?php

namespace Tests\Feature;

use App\Models\AdminAuditLog;
use App\Models\Trip;
use App\Models\TripIncident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminIncidentAssignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_assign_reassign_and_unassign_an_open_incident_with_audit_entries(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations']);
        $supportOne = User::factory()->create([
            'role' => 'admin',
            'admin_role' => 'support',
            'name' => 'Support One',
        ]);
        $supportTwo = User::factory()->create([
            'role' => 'admin',
            'admin_role' => 'support',
            'name' => 'Support Two',
        ]);
        $incident = $this->createIncident();

        $this->actingAs($admin)
            ->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => $supportOne->id])
            ->assertOk();
        $firstAssignmentTime = $incident->fresh()->assigned_at;

        $this->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => $supportTwo->id])
            ->assertOk();
        $this->assertGreaterThanOrEqual(
            $firstAssignmentTime->getTimestamp(),
            $incident->fresh()->assigned_at->getTimestamp(),
        );

        $this->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => null])
            ->assertOk();

        $this->getJson('/api/admin/incidents?status=open&triage=unassigned')
            ->assertOk()
            ->assertJsonPath('response_sla_minutes', 240)
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.assignee', null)
            ->assertJsonFragment(['admin_role' => 'operations']);
        $this->assertSame(3, AdminAuditLog::query()->where('action', 'incident.assigned')->count());
    }

    public function test_only_active_operations_or_support_staff_can_be_assigned(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $support = User::factory()->create(['role' => 'admin', 'admin_role' => 'support']);
        $operations = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations']);
        $superAdmin = User::factory()->create(['role' => 'admin', 'admin_role' => 'super_admin']);
        $inactive = User::factory()->create(['role' => 'admin', 'admin_role' => 'support', 'admin_active' => false]);
        $suspended = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations', 'is_suspended' => true]);
        $passenger = User::factory()->create(['role' => 'passenger']);
        $incident = $this->createIncident();

        $this->actingAs($admin)->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => $support->id])->assertOk();
        $this->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => $operations->id])->assertOk();
        $this->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => $superAdmin->id])->assertUnprocessable();
        $this->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => $inactive->id])->assertUnprocessable();
        $this->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => $suspended->id])->assertUnprocessable();
        $this->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => $passenger->id])->assertUnprocessable();

        $this->assertSame($operations->id, $incident->fresh()->assigned_to);
        $this->assertSame(2, AdminAuditLog::query()->where('action', 'incident.assigned')->count());
    }

    public function test_support_staff_can_assign_incidents_and_first_note_records_first_response(): void
    {
        $support = User::factory()->create(['role' => 'admin', 'admin_role' => 'support']);
        $operations = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations']);
        $incident = $this->createIncident(now()->subHours(5));

        $this->actingAs($support)
            ->patchJson("/api/admin/incidents/{$incident->id}/assignment", ['assignee_id' => $operations->id])
            ->assertOk();
        $this->assertNull($incident->fresh()->first_response_at);

        $this->postJson("/api/admin/incidents/{$incident->id}/notes", ['body' => 'Initial follow-up response.'])
            ->assertOk();

        $firstResponseAt = $incident->fresh()->first_response_at;
        $this->assertNotNull($firstResponseAt);

        $this->travel(1)->minutes();
        $this->postJson("/api/admin/incidents/{$incident->id}/notes", ['body' => 'Second follow-up note.'])
            ->assertOk();
        $this->assertTrue($incident->fresh()->first_response_at->equalTo($firstResponseAt));

        $this->getJson('/api/admin/incidents?status=open&triage=overdue')
            ->assertOk()
            ->assertJsonPath('total', 0);
    }

    public function test_unresponded_open_incidents_are_overdue_after_four_hours_and_resolved_incidents_cannot_be_assigned(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations']);
        $support = User::factory()->create(['role' => 'admin', 'admin_role' => 'support']);
        $overdue = $this->createIncident(now()->subHours(5));
        $fresh = $this->createIncident(now()->subHours(2));
        $resolved = $this->createIncident(now()->subHours(6));
        $resolved->update(['status' => 'resolved', 'resolved_at' => now()]);

        $this->actingAs($admin)
            ->getJson('/api/admin/incidents?status=open&triage=overdue')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $overdue->id)
            ->assertJsonPath('data.0.is_overdue', true);

        $this->patchJson("/api/admin/incidents/{$fresh->id}/assignment", ['assignee_id' => $support->id])->assertOk();
        $this->patchJson("/api/admin/incidents/{$resolved->id}/assignment", ['assignee_id' => $support->id])->assertConflict();
        $this->patchJson("/api/admin/incidents/{$overdue->id}/assignment", ['assignee_id' => 'invalid'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('assignee_id');
    }

    private function createIncident($createdAt = null): TripIncident
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $trip = Trip::query()->create([
            'passenger_id' => $passenger->id,
            'pickup_point' => DB::raw("ST_GeomFromText('POINT(-1.24 5.10)', 4326)"),
            'destination_point' => DB::raw("ST_GeomFromText('POINT(-1.25 5.11)', 4326)"),
            'pickup_location' => 'Station',
            'destination_location' => 'Market',
            'estimated_distance_km' => 2.5,
            'estimated_fare' => 11.25,
            'status' => 'completed',
        ]);
        $incident = TripIncident::query()->create([
            'trip_id' => $trip->id,
            'created_by' => $passenger->id,
            'category' => 'safety',
            'summary' => 'Needs operational follow-up',
            'status' => 'open',
        ]);

        if ($createdAt !== null) {
            $incident->forceFill(['created_at' => $createdAt, 'updated_at' => $createdAt])->save();
        }

        return $incident;
    }
}
