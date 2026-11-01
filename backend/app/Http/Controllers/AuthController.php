<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function requestOtp(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'role' => 'required|in:passenger,rider'
        ]);

        $otp = (string) random_int(100000, 999999);

        // Log the OTP for local development and testing
        Log::info("OTP for {$request->phone} ({$request->role}): {$otp}");

        $user = User::firstOrCreate(
            ['phone' => $request->phone, 'role' => $request->role],
            ['status' => 'active']
        );

        $user->update([
            'otp_code' => $otp,
            'otp_expires_at' => now()->addMinutes(10)
        ]);

        // In production, trigger your SMS provider here instead

        return response()->json([
            'message' => 'OTP generated successfully.',
        ]);
    }

    public function verifyOtp(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'role' => 'required|in:passenger,rider',
            'otp' => 'required|string|size:6'
        ]);

        $user = User::where('phone', $request->phone)
            ->where('role', $request->role)
            ->first();

        if (!$user || $user->otp_code !== $request->otp || now()->greaterThan($user->otp_expires_at)) {
            throw ValidationException::withMessages([
                'otp' => ['The provided OTP is invalid or has expired.'],
            ]);
        }

        $user->update([
            'otp_code' => null,
            'otp_expires_at' => null,
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'access_token' => $token,
            'user' => $user,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }
}