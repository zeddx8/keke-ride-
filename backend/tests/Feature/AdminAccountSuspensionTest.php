<?php

namespace Tests\Feature;

use App\Models\AdminAuditLog;
use App\Models\RiderLocation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminAccountSuspensionTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_suspend_and_restore_an_account_with_audited_reason_and_revoked_tokens(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'admin_role' => 'super_admin']);
        $account = User::factory()->create([
            'role' => 'passenger',
            'phone_verified_at' => now(),
            'password' => Hash::make('test-password'),
        ]);
        $adminToken = $admin->createToken('admin-device')->plainTextToken;
        $accountToken = $account->createToken('passenger-device')->plainTextToken;
        $reason = 'Repeated fraudulent ride requests.';

        $this->withToken($adminToken)
            ->patchJson("/api/admin/users/{$account->id}/suspension", [
                'suspended' => true,
                'reason' => $reason,
            ])
            ->assertOk()
            ->assertJsonPath('message', 'Account suspended and active tokens revoked.');

        $this->assertTrue($account->fresh()->is_suspended);
        $this->assertSame($reason, $account->fresh()->suspension_reason);
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->app['auth']->forgetGuards();
        $this->withToken($accountToken)->getJson('/api/user')->assertUnauthorized();
        $suspendedToken = $account->fresh()->createToken('stale-device')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $this->withToken($suspendedToken)->getJson('/api/user')->assertForbidden();
        $this->postJson('/api/auth/login', [
            'phone' => $account->phone,
            'password' => 'test-password',
            'device_name' => 'passenger-device',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('credentials');

        $this->app['auth']->forgetGuards();
        $this->withToken($adminToken)->getJson('/api/admin/users?role=passenger')
            ->assertOk()
            ->assertJsonPath('data.0.is_suspended', true)
            ->assertJsonPath('data.0.suspension_reason', $reason);
        $this->app['auth']->forgetGuards();
        $this->withToken($adminToken)->getJson('/api/admin/audit-logs?action=account.suspended')
            ->assertOk()
            ->assertJsonPath('data.0.action', 'account.suspended')
            ->assertJsonPath('data.0.summary', 'Suspended passenger account #'.$account->id.'.')
            ->assertDontSee($reason);

        $this->app['auth']->forgetGuards();
        $this->withToken($adminToken)
            ->patchJson("/api/admin/users/{$account->id}/suspension", ['suspended' => false])
            ->assertOk()
            ->assertJsonPath('message', 'Account restored. The user can sign in again.');

        $this->assertFalse($account->fresh()->is_suspended);
        $this->assertNull($account->fresh()->suspension_reason);
        $this->assertDatabaseHas('admin_audit_logs', [
            'action' => 'account.restored',
            'subject_id' => $account->id,
            'summary' => 'Restored passenger account #'.$account->id.'.',
        ]);
        $this->assertSame(2, AdminAuditLog::query()
            ->whereIn('action', ['account.suspended', 'account.restored'])
            ->count());
    }

    public function test_suspending_a_rider_sets_them_offline_and_clears_online_location(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $rider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        RiderLocation::create([
            'rider_id' => $rider->id,
            'latitude' => 5.1,
            'longitude' => -1.2,
            'is_online' => true,
        ]);

        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$rider->id}/suspension", [
                'suspended' => true,
                'reason' => 'Safety review requested.',
            ])
            ->assertOk();

        $this->assertDatabaseHas('users', [
            'id' => $rider->id,
            'status' => 'offline',
            'is_suspended' => true,
        ]);
        $this->assertDatabaseHas('rider_locations', [
            'rider_id' => $rider->id,
            'is_online' => false,
        ]);
    }

    public function test_suspension_requires_a_reason_and_only_passenger_or_rider_accounts_can_be_suspended(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$passenger->id}/suspension", [
                'suspended' => true,
                'reason' => 'no',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');

        $this->patchJson("/api/admin/users/{$admin->id}/suspension", [
            'suspended' => true,
            'reason' => 'Invalid target role.',
        ])->assertNotFound();

        $this->assertFalse($passenger->fresh()->is_suspended);
        $this->assertDatabaseCount('admin_audit_logs', 0);
    }

    public function test_non_admin_and_operations_role_cannot_suspend_accounts(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $account = User::factory()->create(['role' => 'rider']);

        $this->actingAs($passenger)
            ->patchJson("/api/admin/users/{$account->id}/suspension", [
                'suspended' => true,
                'reason' => 'Unauthorized action.',
            ])
            ->assertForbidden();

        $operations = User::factory()->create(['role' => 'admin', 'admin_role' => 'operations']);
        $this->actingAs($operations)
            ->patchJson("/api/admin/users/{$account->id}/suspension", [
                'suspended' => true,
                'reason' => 'Not allowed for operations.',
            ])
            ->assertForbidden();
        $this->assertFalse($account->fresh()->is_suspended);
    }
}
