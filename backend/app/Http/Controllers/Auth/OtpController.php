<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class OtpController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'phone' => 'required|string|regex:/^[0-9]{10,15}$/|unique:users,phone',
            'role' => 'required|in:passenger,rider',
            'password' => 'required|string|min:8|max:255|confirmed',
        ]);

        $this->ensureSmsDeliveryConfigured();
        $this->enforceOtpRequestLimit($validated['phone']);

        $user = User::create([
            'name' => $validated['name'],
            'phone' => $validated['phone'],
            'password' => $validated['password'],
            'role' => $validated['role'],
            'status' => $validated['role'] === 'rider' ? 'offline' : 'active',
        ]);

        $this->issueOtp($user, 'registration');

        return response()->json([
            'message' => 'Account created. Enter the verification code to continue.',
            'expires_in' => 300,
        ], 201);
    }

    public function login(Request $request)
    {
        $validated = $request->validate([
            'phone' => 'required|string|regex:/^[0-9]{10,15}$/',
            'password' => 'required|string',
            'device_name' => 'required|string|max:100',
        ]);

        $user = User::query()->where('phone', $validated['phone'])->first();
        if (! $user || ! $user->password || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'credentials' => ['The phone number or password is incorrect.'],
            ]);
        }

        if (! $user->phone_verified_at) {
            throw ValidationException::withMessages([
                'phone' => ['Verify your phone number before signing in.'],
            ]);
        }

        if ($user->is_suspended) {
            throw ValidationException::withMessages([
                'credentials' => ['This account has been suspended. Contact Keke Ride support.'],
            ]);
        }

        if ($user->role === 'admin' && ! $user->admin_active) {
            throw ValidationException::withMessages([
                'credentials' => ['This administrator account has been deactivated. Contact your Super Admin.'],
            ]);
        }

        if ($user->role === 'rider') {
            $user->tokens()->delete();
        }

        return $this->tokenResponse($user, $validated['device_name']);
    }

    public function verifyRegistration(Request $request)
    {
        $validated = $request->validate([
            'phone' => 'required|string|regex:/^[0-9]{10,15}$/',
            'otp' => 'required|string|size:6',
            'device_name' => 'required|string|max:100',
        ]);

        $this->ensureSmsDeliveryConfigured();
        $user = $this->verifiedOtpUser($validated['phone'], $validated['otp'], 'registration');
        $user->forceFill([
            'phone_verified_at' => now(),
            'otp_code' => null,
            'otp_expires_at' => null,
            'otp_purpose' => null,
        ])->save();

        return $this->tokenResponse($user, $validated['device_name']);
    }

    public function resendRegistrationOtp(Request $request)
    {
        $validated = $request->validate([
            'phone' => 'required|string|regex:/^[0-9]{10,15}$/',
        ]);

        $user = User::query()
            ->where('phone', $validated['phone'])
            ->whereNull('phone_verified_at')
            ->whereIn('role', ['passenger', 'rider'])
            ->first();

        if ($user) {
            $this->ensureSmsDeliveryConfigured();
            $this->enforceOtpRequestLimit($user->phone);
            $this->issueOtp($user, 'registration');
        }

        return response()->json([
            'message' => 'If an account is waiting for phone verification, a new code has been sent.',
            'expires_in' => 300,
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $validated = $request->validate([
            'phone' => 'required|string|regex:/^[0-9]{10,15}$/',
        ]);

        $this->ensureSmsDeliveryConfigured();
        $user = User::query()
            ->where('phone', $validated['phone'])
            ->whereIn('role', ['passenger', 'rider', 'admin'])
            ->first();

        if ($user) {
            $this->enforceOtpRequestLimit($user->phone);
            $this->issueOtp($user, 'password_reset');
        }

        return response()->json([
            'message' => 'If an account exists for that phone number, a password reset code has been sent.',
            'expires_in' => 300,
        ]);
    }

    public function resetPassword(Request $request)
    {
        $validated = $request->validate([
            'phone' => 'required|string|regex:/^[0-9]{10,15}$/',
            'otp' => 'required|string|size:6',
            'password' => 'required|string|min:8|max:255|confirmed',
        ]);

        $this->ensureSmsDeliveryConfigured();
        $this->enforceOtpVerificationLimit($validated['phone']);
        $user = $this->verifiedOtpUser($validated['phone'], $validated['otp'], 'password_reset');
        $user->forceFill([
            'password' => $validated['password'],
            'phone_verified_at' => $user->phone_verified_at ?? now(),
            'otp_code' => null,
            'otp_expires_at' => null,
            'otp_purpose' => null,
        ])->save();
        $user->tokens()->delete();
        RateLimiter::clear($this->otpVerificationKey($validated['phone']));

        return response()->json([
            'message' => 'Password reset successfully. Sign in with your new password.',
        ]);
    }

    private function verifiedOtpUser(string $phone, string $otp, string $purpose): User
    {
        $user = User::query()->where('phone', $phone)->first();
        if (
            ! $user
            || $user->otp_purpose !== $purpose
            || ! $user->otp_code
            || ! $user->otp_expires_at
            || now()->greaterThan($user->otp_expires_at)
            || ! Hash::check($otp, $user->otp_code)
        ) {
            $this->enforceOtpVerificationLimit($phone);
            RateLimiter::hit($this->otpVerificationKey($phone), 600);
            throw ValidationException::withMessages([
                'otp' => ['The code is incorrect, expired, or not valid for this action.'],
            ]);
        }

        return $user;
    }

    private function issueOtp(User $user, string $purpose): void
    {
        $otp = (string) random_int(100000, 999999);
        $user->forceFill([
            'otp_code' => Hash::make($otp),
            'otp_expires_at' => now()->addMinutes(5),
            'otp_purpose' => $purpose,
        ])->save();

        Log::info("Keke Ride {$purpose} OTP for {$user->phone}: {$otp}");
    }

    private function enforceOtpRequestLimit(string $phone): void
    {
        $key = 'auth-otp-request:'.hash('sha256', $phone);
        if (RateLimiter::tooManyAttempts($key, 1)) {
            abort(429, 'Please wait before requesting another code.');
        }
        RateLimiter::hit($key, 60);
    }

    private function enforceOtpVerificationLimit(string $phone): void
    {
        if (RateLimiter::tooManyAttempts($this->otpVerificationKey($phone), 5)) {
            abort(429, 'Too many incorrect codes. Request a new code and try again.');
        }
    }

    private function otpVerificationKey(string $phone): string
    {
        return 'auth-otp-verify:'.hash('sha256', $phone);
    }

    private function ensureSmsDeliveryConfigured(): void
    {
        if (app()->environment('production')) {
            abort(503, 'Phone verification delivery is not configured. Please contact support.');
        }
    }

    private function tokenResponse(User $user, string $deviceName)
    {
        $token = $user->createToken($deviceName, [$user->role])->plainTextToken;

        return response()->json([
            'token' => $token,
            'role' => $user->role,
            'status' => $user->status,
        ]);
    }
}
