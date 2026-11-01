<?php

namespace Tests\Feature;

use App\Models\AdminAuditLog;
use App\Models\Trip;
use App\Models\TripIncident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminRoleTest extends TestCase
{
    use RefreshDatabase;

    public function test_support_can_view_incidents_and_add_notes_but_cannot_resolve_or_manage_accounts(): void
    {
        $superAdmin = User::factory()->create(['role' => 'admin', 'admin_role' => 'super_admin']);
        $support = User::factory()->create(['role' => 'admin', 'admin_role' => 'support']);
        $passenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createTrip($passenger);

        $this->actingAs($superAdmin)
            ->postJson('/api/admin/incidents', [
                'trip_id' => $trip->id,
                'category' => 'safety',
                'summary' => 'Needs support follow-up',
                'details' => 'Initial support details.',
            ])
            ->assertCreated();

        $incidentId = TripIncident::query()->value('id');

        $this->actingAs($support);
        $this->getJson('/api/admin/overview')
            ->assertOk();
        $this->getJson('/api/admin/incidents')->assertOk();
        $this->postJson("/api/admin/incidents/{$incidentId}/notes", ['body' => 'Support followed up.'])
            ->assertOk();
        $this->postJson("/api/admin/incidents/{$incidentId}/resolve", [])->assertForbidden();
        $this->postJson('/api/admin/incidents', [
            'trip_id' => $trip->id,
            'category' => 'safety',
            'summary' => 'Cannot create',
            'details' => 'Not permitted.',
        ])->assertForbidden();
        $this->getJson('/api/admin/users')->assertForbidden();
        $this->getJson('/api/admin/audit-logs')->assertForbidden();
    }

    public function test_operations_can_review_riders_and_view_audit_but_cannot_manage_accounts_or_staff_roles(): void
    {
        $operations = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations']);

        $this->actingAs($operations);
        $this->getJson('/api/admin/active-trips')->assertOk();
        $this->getJson('/api/admin/audit-logs')->assertOk();
        $this->getJson('/api/admin/users')->assertForbidden();
        $this->getJson('/api/admin/staff')->assertForbidden();
    }

    public function test_super_admin_can_change_staff_roles_and_the_change_is_audited(): void
    {
        $superAdmin = User::factory()->create(['role' => 'admin', 'admin_role' => 'super_admin']);
        $staff = User::factory()->create([
            'role' => 'admin',
            'admin_role' => 'support',
            'name' => 'Support Agent',
        ]);

        $this->actingAs($superAdmin);
        $this->getJson('/api/admin/staff')
            ->assertOk()
            ->assertJsonFragment(['id' => $superAdmin->id, 'admin_role' => 'super_admin'])
            ->assertJsonPath('total', 2);
        $this->patchJson("/api/admin/staff/{$staff->id}/role", ['admin_role' => 'operations'])
            ->assertOk();

        $this->assertSame('operations', $staff->fresh()->admin_role);
        $this->assertDatabaseHas('admin_audit_logs', [
            'admin_id' => $superAdmin->id,
            'action' => 'admin.role_changed',
            'subject_type' => 'user',
            'subject_id' => $staff->id,
            'summary' => 'Changed admin #'.$staff->id.' from support to operations.',
        ]);
    }

    public function test_super_admin_cannot_remove_themselves_or_the_last_super_admin(): void
    {
        $superAdmin = User::factory()->create(['role' => 'admin', 'admin_role' => 'super_admin']);
        $otherAdmin = User::factory()->create(['role' => 'admin', 'admin_role' => 'support']);

        $this->actingAs($superAdmin)
            ->patchJson("/api/admin/staff/{$superAdmin->id}/role", ['admin_role' => 'support'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('admin_role');

        $this->actingAs($superAdmin)
            ->patchJson("/api/admin/staff/{$otherAdmin->id}/role", ['admin_role' => 'invalid'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('admin_role');

        $this->assertSame('super_admin', $superAdmin->fresh()->admin_role);
        $this->assertSame('support', $otherAdmin->fresh()->admin_role);

        $otherAdmin->update(['admin_role' => 'super_admin']);
        $this->actingAs($superAdmin)
            ->patchJson("/api/admin/staff/{$otherAdmin->id}/role", ['admin_role' => 'support'])
            ->assertOk();

        $this->assertSame(1, User::query()->where('role', 'admin')->where('admin_role', 'super_admin')->count());
        $this->assertSame(1, AdminAuditLog::query()->where('action', 'admin.role_changed')->count());
    }

    public function test_super_admin_can_invite_admin_staff_with_support_as_the_default_role(): void
    {
        $superAdmin = User::factory()->create(['role' => 'admin', 'admin_role' => 'super_admin']);

        $this->actingAs($superAdmin)
            ->postJson('/api/admin/staff', ['phone' => '0245558822'])
            ->assertCreated()
            ->assertJsonPath('staff.phone', '0245558822')
            ->assertJsonPath('staff.admin_role', 'support')
            ->assertJsonPath('staff.admin_active', true)
            ->assertJsonPath('message', 'Administrator account created. They can use Forgot password to verify their phone and set an initial password.');

        $staff = User::query()->where('phone', '0245558822')->firstOrFail();
        $this->assertNull($staff->password);
        $this->assertNull($staff->phone_verified_at);
        $this->assertDatabaseHas('admin_audit_logs', [
            'admin_id' => $superAdmin->id,
            'action' => 'admin.invited',
            'subject_type' => 'user',
            'subject_id' => $staff->id,
            'summary' => 'Invited admin #'.$staff->id.' as support.',
        ]);

        $this->actingAs($superAdmin)
            ->postJson('/api/admin/staff', ['phone' => '0245558822'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('phone');
    }

    public function test_super_admin_can_deactivate_and_reactivate_staff_and_deactivation_revokes_tokens(): void
    {
        $superAdmin = User::factory()->create(['role' => 'admin', 'admin_role' => 'super_admin']);
        $staff = User::factory()->create([
            'role' => 'admin',
            'admin_role' => 'support',
            'phone_verified_at' => now(),
            'password' => Hash::make('test-password'),
        ]);
        $superAdminToken = $superAdmin->createToken('super-admin-device')->plainTextToken;
        $token = $staff->createToken('staff-device')->plainTextToken;

        $this->app['auth']->forgetGuards();
        $this->withToken($superAdminToken)
            ->patchJson("/api/admin/staff/{$staff->id}/active", ['active' => false])
            ->assertOk()
            ->assertJsonPath('message', 'Administrator account deactivated and active tokens revoked.');

        $this->assertFalse($staff->fresh()->admin_active);
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/user')->assertUnauthorized();
        $this->assertDatabaseHas('admin_audit_logs', [
            'action' => 'admin.deactivated',
            'subject_id' => $staff->id,
            'summary' => 'Deactivated admin #'.$staff->id.'.',
        ]);

        $this->app['auth']->forgetGuards();
        $this->withToken($superAdminToken)
            ->patchJson("/api/admin/staff/{$staff->id}/active", ['active' => true])
            ->assertOk()
            ->assertJsonPath('message', 'Administrator account reactivated.');

        $this->assertTrue($staff->fresh()->admin_active);
        $this->assertDatabaseHas('admin_audit_logs', [
            'action' => 'admin.activated',
            'subject_id' => $staff->id,
        ]);
    }

    public function test_deactivated_admin_cannot_log_in_or_use_authenticated_api_routes(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'admin_role' => 'support',
            'admin_active' => false,
            'phone_verified_at' => now(),
            'password' => Hash::make('test-password'),
        ]);

        $this->postJson('/api/auth/login', [
            'phone' => $admin->phone,
            'password' => 'test-password',
            'device_name' => 'test-device',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('credentials');

        $this->actingAs($admin)
            ->getJson('/api/user')
            ->assertForbidden();
    }

    public function test_super_admin_cannot_deactivate_themselves_or_the_last_active_super_admin(): void
    {
        $superAdmin = User::factory()->create(['role' => 'admin', 'admin_role' => 'super_admin']);
        $otherSuperAdmin = User::factory()->create(['role' => 'admin', 'admin_role' => 'super_admin']);

        $this->actingAs($superAdmin)
            ->patchJson("/api/admin/staff/{$superAdmin->id}/active", ['active' => false])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('active');

        $this->patchJson("/api/admin/staff/{$otherSuperAdmin->id}/active", ['active' => false])
            ->assertOk();

        $this->assertTrue($superAdmin->fresh()->admin_active);
        $this->assertFalse($otherSuperAdmin->fresh()->admin_active);
        $this->assertSame(1, User::query()
            ->where('role', 'admin')
            ->where('admin_role', 'super_admin')
            ->where('admin_active', true)
            ->count());
    }

    public function test_non_admin_cannot_manage_staff_access(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->getJson('/api/admin/staff')
            ->assertForbidden();
    }

    public function test_non_admin_accounts_have_no_admin_role_and_new_admins_default_to_support(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $admin = User::create([
            'phone' => '0245559911',
            'role' => 'admin',
            'status' => 'active',
        ]);

        $this->assertNull($passenger->admin_role);
        $this->assertSame('support', $admin->admin_role);
        $this->assertFalse($admin->hasAdminPermission('staff.manage'));
    }

    private function createTrip(User $passenger): Trip
    {
        return Trip::create([
            'passenger_id' => $passenger->id,
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
