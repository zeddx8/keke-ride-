<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\HubtelSmsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class OtpTest extends TestCase
{
    use RefreshDatabase;

    public function test_passenger_and_rider_can_register_but_must_verify_phone(): void
    {
        foreach (['passenger', 'rider'] as $role) {
            $phone = $role === 'passenger' ? '0241234567' : '0201234567';
            $response = $this->postJson('/api/auth/register', [
                'name' => ucfirst($role).' Name',
                'phone' => $phone,
                'role' => $role,
                'password' => 'secure-password',
                'password_confirmation' => 'secure-password',
            ]);

            $response->assertCreated()
                ->assertJsonStructure(['message', 'expires_in']);

            $user = User::query()->where('phone', $phone)->firstOrFail();
            $this->assertSame($role, $user->role);
            $this->assertNull($user->phone_verified_at);
            $this->assertSame('registration', $user->otp_purpose);
            $this->assertTrue(Hash::check('secure-password', $user->password));

            $this->postJson('/api/auth/login', [
                'phone' => $phone,
                'password' => 'secure-password',
                'device_name' => 'test-device',
            ])->assertUnprocessable()
                ->assertJsonValidationErrors('phone');
        }

        $this->postJson('/api/auth/register', [
            'name' => 'Admin Attempt',
            'phone' => '0271234567',
            'role' => 'admin',
            'password' => 'secure-password',
            'password_confirmation' => 'secure-password',
        ])->assertUnprocessable();

        $this->assertDatabaseMissing('users', ['phone' => '0271234567']);
    }

    public function test_verified_user_can_sign_in_with_phone_and_password(): void
    {
        $user = User::factory()->create([
            'phone' => '0201112222',
            'password' => 'correct-password',
            'phone_verified_at' => now(),
        ]);

        $this->postJson('/api/auth/login', [
            'phone' => $user->phone,
            'password' => 'incorrect-password',
            'device_name' => 'test-device',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('credentials');

        $this->postJson('/api/auth/login', [
            'phone' => $user->phone,
            'password' => 'correct-password',
            'device_name' => 'test-device',
        ])->assertOk()
            ->assertJsonStructure(['token', 'role', 'status']);
    }

    public function test_registration_code_verifies_phone_and_issues_token(): void
    {
        $user = User::factory()->create([
            'phone' => '0201112222',
            'phone_verified_at' => null,
            'otp_code' => Hash::make('123456'),
            'otp_expires_at' => now()->addMinutes(5),
            'otp_purpose' => 'registration',
        ]);

        $this->postJson('/api/auth/verify-registration', [
            'phone' => $user->phone,
            'otp' => '123456',
            'device_name' => 'test-device',
        ])->assertOk()
            ->assertJsonStructure(['token', 'role', 'status']);

        $this->assertNotNull($user->fresh()->phone_verified_at);
        $this->assertNull($user->fresh()->otp_code);
        $this->assertNull($user->fresh()->otp_purpose);
    }

    public function test_otp_is_bound_to_its_purpose_and_expires(): void
    {
        $user = User::factory()->create([
            'phone' => '0201112222',
            'otp_code' => Hash::make('123456'),
            'otp_expires_at' => now()->addMinutes(5),
            'otp_purpose' => 'password_reset',
        ]);

        $this->postJson('/api/auth/verify-registration', [
            'phone' => $user->phone,
            'otp' => '123456',
            'device_name' => 'test-device',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('otp');

        $user->forceFill([
            'otp_purpose' => 'registration',
            'otp_expires_at' => now()->subSecond(),
        ])->save();

        $this->postJson('/api/auth/verify-registration', [
            'phone' => $user->phone,
            'otp' => '123456',
            'device_name' => 'test-device',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('otp');
    }

    public function test_password_reset_verifies_phone_and_revokes_existing_tokens(): void
    {
        $user = User::factory()->create([
            'phone' => '0201112222',
            'role' => 'admin',
            'password' => null,
            'phone_verified_at' => null,
        ]);
        $user->createToken('old-device');

        $otp = null;
        Log::shouldReceive('info')
            ->once()
            ->withArgs(function (string $message) use (&$otp): bool {
                if (preg_match('/password_reset OTP for 0201112222: ([0-9]{6})$/', $message, $matches) !== 1) {
                    return false;
                }

                $otp = $matches[1];

                return true;
            });

        $this->postJson('/api/auth/forgot-password', ['phone' => $user->phone])
            ->assertOk()
            ->assertJsonStructure(['message', 'expires_in']);

        $this->postJson('/api/auth/reset-password', [
            'phone' => $user->phone,
            'otp' => '000000',
            'password' => 'new-secure-password',
            'password_confirmation' => 'new-secure-password',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('otp');

        $this->assertNotNull($otp);
        $this->postJson('/api/auth/reset-password', [
            'phone' => $user->phone,
            'otp' => $otp,
            'password' => 'new-secure-password',
            'password_confirmation' => 'new-secure-password',
        ])->assertOk();

        $this->assertTrue(Hash::check('new-secure-password', $user->fresh()->password));
        $this->assertNotNull($user->fresh()->phone_verified_at);
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_registration_code_cannot_reset_password(): void
    {
        $user = User::factory()->create([
            'phone' => '0201112222',
            'otp_code' => Hash::make('123456'),
            'otp_expires_at' => now()->addMinutes(5),
            'otp_purpose' => 'registration',
        ]);

        $this->postJson('/api/auth/reset-password', [
            'phone' => $user->phone,
            'otp' => '123456',
            'password' => 'new-secure-password',
            'password_confirmation' => 'new-secure-password',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('otp');
    }

    public function test_unverified_registration_code_can_be_resent_with_cooldown(): void
    {
        $user = User::factory()->create([
            'phone' => '0201112222',
            'phone_verified_at' => null,
        ]);

        Log::shouldReceive('info')->once();

        $this->postJson('/api/auth/resend-registration-code', ['phone' => $user->phone])
            ->assertOk();

        $this->postJson('/api/auth/resend-registration-code', ['phone' => $user->phone])
            ->assertTooManyRequests();
    }

    public function test_hubtel_service_normalizes_ghana_numbers_and_sends_sms(): void
    {
        config([
            'services.hubtel.url' => 'https://smsc.hubtel.com/v1/messages/send',
            'services.hubtel.client_id' => 'test-client',
            'services.hubtel.client_secret' => 'test-secret',
            'services.hubtel.sender_id' => 'KekeRide',
        ]);

        Http::fake([
            'https://smsc.hubtel.com/v1/messages/send' => Http::response(['Status' => 0], 200),
        ]);

        (new HubtelSmsService())->send('0241234567', 'Your Keke Ride code is 123456.');

        Http::assertSent(function ($request) {
            return $request->url() === 'https://smsc.hubtel.com/v1/messages/send'
                && $request['From'] === 'KekeRide'
                && $request['To'] === '233241234567'
                && str_contains((string) $request['Content'], '123456');
        });
    }

    public function test_production_registration_requires_configured_sms_delivery(): void
    {
        app()->detectEnvironment(fn () => 'production');
        config([
            'services.hubtel.client_id' => null,
            'services.hubtel.client_secret' => null,
            'services.hubtel.sender_id' => null,
        ]);

        $this->postJson('/api/auth/register', [
            'name' => 'Production User',
            'phone' => '0249876543',
            'role' => 'passenger',
            'password' => 'secure-password',
            'password_confirmation' => 'secure-password',
        ])->assertServiceUnavailable();
    }
}
