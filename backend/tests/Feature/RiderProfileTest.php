<?php

namespace Tests\Feature;

use App\Models\RiderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RiderProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_rider_can_create_profile_with_images()
    {
        Storage::fake('local');
        $rider = User::factory()->create(['role' => 'rider']);

        $response = $this->actingAs($rider)->postJson('/api/rider/profile', [
            'name' => 'Kwame Mensah',
            'license_number' => 'DL123456',
            'ghana_card_number' => 'GHA-123456789-1',
            'plate_number' => 'CR-123-24',
            'license_image' => UploadedFile::fake()->image('license.jpg', 800, 600)->size(100),
            'ghana_card_image' => UploadedFile::fake()->image('card.jpg', 800, 600)->size(100),
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['message', 'profile' => ['license_image_url', 'ghana_card_image_url']]);

        $this->assertDatabaseHas('rider_profiles', [
            'user_id' => $rider->id,
            'plate_number' => 'CR-123-24',
        ]);
        $this->assertDatabaseHas('users', [
            'id' => $rider->id,
            'status' => 'offline',
        ]);
    }

    public function test_passenger_cannot_create_rider_profile()
    {
        $passenger = User::factory()->create(['role' => 'passenger']);

        $response = $this->actingAs($passenger)->postJson('/api/rider/profile', [
            'name' => 'Kwame Mensah',
            'license_number' => 'DL123456',
            'ghana_card_number' => 'GHA-123456789-1',
            'plate_number' => 'CR-123-24',
            'license_image' => UploadedFile::fake()->image('license.jpg'),
            'ghana_card_image' => UploadedFile::fake()->image('card.jpg'),
        ]);

        $response->assertStatus(403);
    }

    public function test_rejected_rider_can_resubmit_a_profile_for_review()
    {
        Storage::fake('local');
        $rider = User::factory()->create(['role' => 'rider']);
        $profile = RiderProfile::create([
            'user_id' => $rider->id,
            'name' => 'Kwame Mensah',
            'license_number' => 'OLD-LICENSE',
            'ghana_card_number' => 'OLD-CARD',
            'plate_number' => 'CR-123-24',
            'license_image_path' => 'profiles/old-license.jpg',
            'ghana_card_image_path' => 'profiles/old-card.jpg',
            'verification_status' => 'rejected',
        ]);
        Storage::disk('local')->put('profiles/old-license.jpg', 'old license');
        Storage::disk('local')->put('profiles/old-card.jpg', 'old card');

        $response = $this->actingAs($rider)->postJson('/api/rider/profile', [
            'name' => 'Kwame Mensah',
            'license_number' => 'NEW-LICENSE',
            'ghana_card_number' => 'NEW-CARD',
            'plate_number' => 'CR-456-24',
            'license_image' => UploadedFile::fake()->image('license.jpg', 800, 600)->size(100),
            'ghana_card_image' => UploadedFile::fake()->image('card.jpg', 800, 600)->size(100),
        ]);

        $response->assertOk()
            ->assertJsonPath('profile.verification_status', 'pending');
        $this->assertSame($profile->id, $profile->fresh()->id);
        $this->assertSame('NEW-LICENSE', $profile->fresh()->license_number);
        Storage::disk('local')->assertMissing('profiles/old-license.jpg');
        Storage::disk('local')->assertMissing('profiles/old-card.jpg');
    }

    public function test_idor_prevention_rider_cannot_view_another_riders_profile()
    {
        $riderOne = User::factory()->create(['role' => 'rider']);
        $riderTwo = User::factory()->create(['role' => 'rider']);

        RiderProfile::create([
            'user_id' => $riderOne->id,
            'name' => 'Rider One',
            'license_number' => 'DL123',
            'ghana_card_number' => 'GHA123',
            'plate_number' => 'CR-111-24',
            'license_image_path' => 'fake.jpg',
            'ghana_card_image_path' => 'fake.jpg',
            'verification_status' => 'pending',
        ]);

        $response = $this->actingAs($riderTwo)->getJson('/api/rider/profile');

        $response->assertStatus(404);
    }
}
