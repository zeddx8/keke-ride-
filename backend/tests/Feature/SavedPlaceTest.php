<?php

namespace Tests\Feature;

use App\Models\SavedPlace;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SavedPlaceTest extends TestCase
{
    use RefreshDatabase;

    public function test_passenger_can_save_list_and_remove_a_place(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);

        $this->actingAs($passenger)
            ->postJson('/api/passenger/saved-places', [
                'name' => 'Home',
                'label' => 'Cape Coast, Ghana',
                'latitude' => 5.1053,
                'longitude' => -1.2466,
            ])
            ->assertCreated()
            ->assertJsonPath('saved_place.name', 'Home');

        $place = SavedPlace::query()->where('user_id', $passenger->id)->firstOrFail();

        $this->actingAs($passenger)
            ->getJson('/api/passenger/saved-places')
            ->assertOk()
            ->assertJsonPath('saved_places.0.label', 'Cape Coast, Ghana')
            ->assertJsonPath('saved_places.0.latitude', 5.1053);

        $this->actingAs($passenger)
            ->deleteJson("/api/passenger/saved-places/{$place->id}")
            ->assertOk();

        $this->assertDatabaseMissing('saved_places', ['id' => $place->id]);
    }

    public function test_passengers_cannot_duplicate_saved_place_names_or_save_more_than_ten(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        SavedPlace::create([
            'user_id' => $passenger->id,
            'name' => 'Home',
            'label' => 'Home',
            'latitude' => 5.1,
            'longitude' => -1.2,
        ]);

        $this->actingAs($passenger)
            ->postJson('/api/passenger/saved-places', [
                'name' => 'Home',
                'label' => 'Different Home',
                'latitude' => 5.2,
                'longitude' => -1.3,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');

        foreach (range(2, 10) as $number) {
            SavedPlace::create([
                'user_id' => $passenger->id,
                'name' => "Place {$number}",
                'label' => "Place {$number}",
                'latitude' => 5.1,
                'longitude' => -1.2,
            ]);
        }

        $this->actingAs($passenger)
            ->postJson('/api/passenger/saved-places', [
                'name' => 'Extra',
                'label' => 'Extra',
                'latitude' => 5.1,
                'longitude' => -1.2,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('saved_places');
    }

    public function test_passenger_cannot_access_another_users_saved_place(): void
    {
        $passenger = User::factory()->create(['role' => 'passenger']);
        $otherPassenger = User::factory()->create(['role' => 'passenger']);
        $place = SavedPlace::create([
            'user_id' => $otherPassenger->id,
            'name' => 'Home',
            'label' => 'Private place',
            'latitude' => 5.1,
            'longitude' => -1.2,
        ]);

        $this->actingAs($passenger)
            ->deleteJson("/api/passenger/saved-places/{$place->id}")
            ->assertNotFound();

        $this->assertDatabaseHas('saved_places', ['id' => $place->id]);
    }

    public function test_non_passengers_cannot_manage_saved_places(): void
    {
        $rider = User::factory()->create(['role' => 'rider']);

        $this->actingAs($rider)
            ->getJson('/api/passenger/saved-places')
            ->assertForbidden();
    }
}
