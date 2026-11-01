<?php

namespace Tests\Feature;

use App\Models\RiderLocation;
use App\Models\RiderProfile;
use App\Models\Trip;
use App\Models\TripIncident;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_view_active_trips_with_participants_and_latest_rider_location(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $passenger = User::factory()->create([
            'role' => 'passenger',
            'name' => 'Passenger One',
        ]);
        $rider = User::factory()->create([
            'role' => 'rider',
            'name' => 'Rider Account',
        ]);
        $this->createProfile($rider)->update(['name' => 'Rider Profile', 'plate_number' => 'CR-123-24']);

        $activeTrip = $this->createTrip($passenger, $rider);
        $activeTrip->update([
            'status' => 'started',
            'landmark_note' => 'By the pharmacy',
        ]);
        RiderLocation::create([
            'rider_id' => $rider->id,
            'latitude' => 5.1053,
            'longitude' => -1.2466,
            'is_online' => true,
        ]);
        $completedTrip = $this->createTrip($passenger, $rider);

        $this->actingAs($admin)
            ->getJson('/api/admin/active-trips')
            ->assertOk()
            ->assertJsonCount(1, 'active_trips')
            ->assertJsonPath('active_trips.0.id', $activeTrip->id)
            ->assertJsonPath('active_trips.0.status', 'started')
            ->assertJsonPath('active_trips.0.passenger.name', 'Passenger One')
            ->assertJsonPath('active_trips.0.passenger.phone', $passenger->phone)
            ->assertJsonPath('active_trips.0.rider.name', 'Rider Profile')
            ->assertJsonPath('active_trips.0.rider.plate_number', 'CR-123-24')
            ->assertJsonPath('active_trips.0.rider_location.latitude', 5.1053)
            ->assertJsonPath('active_trips.0.rider_location.longitude', -1.2466)
            ->assertJsonPath('active_trips.0.landmark_note', 'By the pharmacy')
            ->assertJsonMissing(['id' => $completedTrip->id]);
    }

    public function test_non_admin_cannot_view_active_trips(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->getJson('/api/admin/active-trips')
            ->assertForbidden();
    }

    public function test_admin_can_create_incident_add_a_follow_up_note_and_resolve_it(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'name' => 'Operations Admin']);
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $trip = $this->createTrip($passenger, $rider);
        $trip->update(['status' => 'started']);

        $this->actingAs($admin)
            ->postJson('/api/admin/incidents', [
                'trip_id' => $trip->id,
                'category' => 'safety',
                'summary' => 'Passenger requested a safety check',
                'details' => 'Called the passenger and confirmed they are safe.',
            ])
            ->assertCreated()
            ->assertJsonPath('message', 'Incident recorded and opened for follow-up.');

        $incident = TripIncident::query()->firstOrFail();
        $this->assertNotNull($incident->first_response_at);
        $this->assertDatabaseHas('trip_incident_notes', [
            'trip_incident_id' => $incident->id,
            'created_by' => $admin->id,
            'body' => 'Called the passenger and confirmed they are safe.',
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/incidents?status=open')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.trip_id', $trip->id)
            ->assertJsonPath('data.0.status', 'open')
            ->assertJsonPath('data.0.creator.name', 'Operations Admin')
            ->assertJsonPath('data.0.trip.status', 'started')
            ->assertJsonPath('data.0.notes.0.body', 'Called the passenger and confirmed they are safe.');

        $this->actingAs($admin)
            ->postJson("/api/admin/incidents/{$incident->id}/notes", [
                'body' => 'Rider was reminded to wait at the marked pickup point.',
            ])
            ->assertOk();

        $this->actingAs($admin)
            ->postJson("/api/admin/incidents/{$incident->id}/resolve", [
                'resolution_note' => 'Passenger confirmed the issue is resolved.',
                'reporter_message' => 'We reviewed the report and confirmed the concern was addressed.',
            ])
            ->assertOk()
            ->assertJsonPath('message', 'Incident marked as resolved.');

        $this->assertDatabaseHas('trip_incidents', [
            'id' => $incident->id,
            'status' => 'resolved',
            'resolved_by' => $admin->id,
            'reporter_message' => 'We reviewed the report and confirmed the concern was addressed.',
        ]);
        $this->assertDatabaseCount('trip_incident_notes', 3);

        $this->actingAs($admin)
            ->getJson('/api/admin/incidents?status=resolved')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.status', 'resolved')
            ->assertJsonPath('data.0.resolver.name', 'Operations Admin')
            ->assertJsonPath('data.0.reporter_message', 'We reviewed the report and confirmed the concern was addressed.')
            ->assertJsonPath('data.0.notes.2.body', 'Passenger confirmed the issue is resolved.');

        $this->actingAs($admin)
            ->postJson("/api/admin/incidents/{$incident->id}/notes", ['body' => 'Late note'])
            ->assertConflict();
    }

    public function test_non_admin_cannot_list_or_create_incidents(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $trip = $this->createTrip($passenger, User::factory()->create(['role' => 'rider']));

        $this->actingAs($passenger)
            ->getJson('/api/admin/incidents')
            ->assertForbidden();

        $this->actingAs($passenger)
            ->postJson('/api/admin/incidents', [
                'trip_id' => $trip->id,
                'category' => 'safety',
                'summary' => 'Cannot create',
                'details' => 'Not authorized',
            ])
            ->assertForbidden();
    }

    public function test_incident_creation_validates_trip_category_and_required_details(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin)
            ->postJson('/api/admin/incidents', [
                'trip_id' => 999999,
                'category' => 'unlisted',
                'summary' => '',
                'details' => '',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['trip_id', 'category', 'summary', 'details']);
    }

    public function test_admin_can_view_dashboard_metrics_pending_riders_and_recent_trips(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $profile = $this->createProfile($rider);
        $trip = $this->createTrip($passenger, $rider);
        TripIncident::query()->create([
            'trip_id' => $trip->id,
            'created_by' => $passenger->id,
            'category' => 'service',
            'summary' => 'Waiting for follow-up',
            'status' => 'open',
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('stats.passengers', 1)
            ->assertJsonPath('stats.riders', 1)
            ->assertJsonPath('stats.pending_rider_profiles', 1)
            ->assertJsonPath('stats.open_incidents', 1)
            ->assertJsonPath('stats.trips_today', 1)
            ->assertJsonPath('recent_trips.0.id', $trip->id)
            ->assertJsonPath('pending_riders.0.id', $profile->id)
            ->assertJsonPath('pending_riders.0.name', 'Rider One')
            ->assertJsonPath('pending_riders.0.phone', $rider->phone)
            ->assertJsonMissingPath('pending_riders.0.license_number')
            ->assertJsonMissingPath('pending_riders.0.ghana_card_number');

        $this->assertStringContainsString(
            'signature=',
            $this->getJson('/api/admin/dashboard')->json('pending_riders.0.license_image_url'),
        );
    }

    public function test_admin_can_load_each_dashboard_section_from_its_own_endpoint(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $profile = $this->createProfile($rider);
        $trip = $this->createTrip($passenger, $rider);
        TripIncident::query()->create([
            'trip_id' => $trip->id,
            'created_by' => $passenger->id,
            'category' => 'service',
            'summary' => 'Waiting for follow-up',
            'status' => 'open',
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/overview')
            ->assertOk()
            ->assertJsonPath('stats.passengers', 1)
            ->assertJsonPath('stats.open_incidents', 1)
            ->assertJsonMissingPath('pending_riders')
            ->assertJsonMissingPath('recent_trips');

        $this->actingAs($admin)
            ->getJson('/api/admin/rider-applications')
            ->assertOk()
            ->assertJsonPath('pending_riders.0.id', $profile->id)
            ->assertJsonMissingPath('stats')
            ->assertJsonMissingPath('recent_trips');

        $this->actingAs($admin)
            ->getJson('/api/admin/recent-trips')
            ->assertOk()
            ->assertJsonPath('recent_trips.0.id', $trip->id)
            ->assertJsonMissingPath('stats')
            ->assertJsonMissingPath('pending_riders');

        $this->actingAs($admin)
            ->getJson('/api/admin/audit-logs')
            ->assertOk()
            ->assertJsonPath('total', 0)
            ->assertJsonCount(0, 'data');
    }

    public function test_non_admin_cannot_view_dashboard_or_review_riders(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $rider = User::factory()->create(['role' => 'rider']);
        $this->createProfile($rider);

        $this->actingAs($passenger)
            ->getJson('/api/admin/dashboard')
            ->assertForbidden();

        $this->actingAs($passenger)
            ->postJson("/api/admin/riders/{$rider->id}/review", ['status' => 'approved'])
            ->assertForbidden();
    }

    public function test_admin_can_create_passenger_and_rider_accounts_but_not_admin_accounts(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin)
            ->postJson('/api/admin/users', [
                'phone' => '0245550001',
                'role' => 'passenger',
            ])
            ->assertCreated()
            ->assertJsonPath('user.role', 'passenger')
            ->assertJsonPath('user.status', 'active');

        $this->actingAs($admin)
            ->postJson('/api/admin/users', [
                'phone' => '0245550002',
                'role' => 'rider',
            ])
            ->assertCreated()
            ->assertJsonPath('user.role', 'rider')
            ->assertJsonPath('user.status', 'offline');

        $this->actingAs($admin)
            ->postJson('/api/admin/users', [
                'phone' => '0245550003',
                'role' => 'admin',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');

        $this->assertDatabaseCount('users', 3);
    }

    public function test_admin_account_creation_rejects_duplicate_or_invalid_phone_numbers(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->create(['phone' => '0245550001']);

        $this->actingAs($admin)
            ->postJson('/api/admin/users', [
                'phone' => '0245550001',
                'role' => 'passenger',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('phone');

        $this->actingAs($admin)
            ->postJson('/api/admin/users', [
                'phone' => 'abc',
                'role' => 'passenger',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('phone');
    }

    public function test_admin_can_search_and_filter_passenger_and_rider_accounts_without_listing_admins(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'phone' => '0245550000']);
        $passenger = User::factory()->create(['role' => 'passenger', 'phone' => '0245551001']);
        User::factory()->create(['role' => 'rider', 'phone' => '0245552002']);

        $this->actingAs($admin)
            ->getJson('/api/admin/users?q=5551&role=passenger')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $passenger->id)
            ->assertJsonMissing(['phone' => $admin->phone]);
    }

    public function test_admin_can_approve_pending_rider_and_account_stays_offline(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $rider = User::factory()->create(['role' => 'rider', 'status' => 'active']);
        $profile = $this->createProfile($rider);
        RiderLocation::create([
            'rider_id' => $rider->id,
            'latitude' => 5.1,
            'longitude' => -1.2,
            'is_online' => true,
        ]);

        $this->actingAs($admin)
            ->postJson("/api/admin/riders/{$rider->id}/review", ['status' => 'approved'])
            ->assertOk()
            ->assertJsonPath('verification_status', 'approved');

        $this->assertDatabaseHas('rider_profiles', [
            'id' => $profile->id,
            'verification_status' => 'approved',
        ]);
        $this->assertDatabaseHas('users', ['id' => $rider->id, 'status' => 'offline']);
        $this->assertDatabaseHas('rider_locations', ['rider_id' => $rider->id, 'is_online' => false]);
    }

    public function test_admin_can_reject_pending_rider_and_cannot_review_twice(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $rider = User::factory()->create(['role' => 'rider']);
        $this->createProfile($rider);

        $this->actingAs($admin)
            ->postJson("/api/admin/riders/{$rider->id}/review", ['status' => 'rejected'])
            ->assertOk()
            ->assertJsonPath('verification_status', 'rejected');

        $this->actingAs($admin)
            ->postJson("/api/admin/riders/{$rider->id}/review", ['status' => 'approved'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');
    }

    private function createProfile(User $rider): RiderProfile
    {
        return RiderProfile::create([
            'user_id' => $rider->id,
            'name' => 'Rider One',
            'license_number' => 'DL-123',
            'ghana_card_number' => 'GHA-123',
            'plate_number' => 'CR-123-24',
            'license_image_path' => 'profiles/license.jpg',
            'ghana_card_image_path' => 'profiles/card.jpg',
            'verification_status' => 'pending',
        ]);
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
