<?php

namespace App\Http\Controllers;

use App\Models\Trip;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use App\Models\TripIncident;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\ImageManager;

class AccountSettingsController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(['settings' => $this->settings($request->user())]);
    }

    public function update(Request $request)
    {
        if ($request->has('phone')) {
            abort(422, 'Phone number cannot be modified directly. Use the phone verification process.');
        }

        $validated = $request->validate([
            'push_notifications_enabled' => ['sometimes', 'boolean'],
            'preferred_language' => ['sometimes', 'string', 'in:en,tw,gau'],
            'first_name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'last_name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255', 'unique:users,email,'.$request->user()->id],
            'payment_method' => ['sometimes', 'string', 'in:cash,wallet,mobile_money'],
            'trusted_contact_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'trusted_contact_phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'hide_exact_location' => ['sometimes', 'boolean'],
            'emergency_alerts_enabled' => ['sometimes', 'boolean'],
            'default_service_type' => ['sometimes', 'string', 'in:ride,delivery'],
            'quiet_ride' => ['sometimes', 'boolean'],
            'extra_luggage' => ['sometimes', 'boolean'],
            'receipt_channel' => ['sometimes', 'string', 'in:none,email,sms'],
            'automatic_rating_prompt' => ['sometimes', 'boolean'],
            'rider_request_radius_km' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'destination_requests_enabled' => ['sometimes', 'boolean'],
            'preferred_areas' => ['sometimes', 'nullable', 'string', 'max:500'],
            'navigation_app' => ['sometimes', 'string', 'in:google_maps,waze,in_app'],
            'break_reminders_enabled' => ['sometimes', 'boolean'],
            'alertness_prompts_enabled' => ['sometimes', 'boolean'],
            'earnings_summary_period' => ['sometimes', 'string', 'in:daily,weekly,monthly'],
            'withdrawal_account' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        if (array_key_exists('first_name', $validated) || array_key_exists('last_name', $validated)) {
            $validated['name'] = trim(
                ($validated['first_name'] ?? $request->user()->first_name ?? '').' '.
                ($validated['last_name'] ?? $request->user()->last_name ?? '')
            ) ?: null;
        }

        $request->user()->update($validated);

        return response()->json([
            'message' => 'Settings saved.',
            'settings' => $this->settings($request->user()),
        ]);
    }

    public function deleteHistory(Request $request)
    {
        $user = $request->user();
        abort_unless(in_array($user->role, ['passenger', 'rider'], true), 403);

        $user->update(['ride_history_deleted_at' => now()]);

        return response()->json([
            'message' => 'Ride history has been deleted from your view.',
        ]);
    }

    public function uploadSelfie(Request $request)
    {
        $validated = $request->validate([
            'selfie' => ['required', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $user = $request->user();
        abort_unless($user->role === 'rider', 403);
        $profile = $user->riderProfile;
        abort_if(! $profile, 404, 'Submit a rider profile first.');

        $image = (new ImageManager(new Driver))->read($validated['selfie']->getRealPath());
        $filename = Str::random(40).'.jpg';
        $path = 'selfies/'.$filename;
        Storage::disk('local')->put($path, $image->cover(800, 800)->toJpeg(82)->toString());

        if ($profile->selfie_image_path) {
            Storage::disk('local')->delete($profile->selfie_image_path);
        }

        $profile->update([
            'selfie_image_path' => $path,
            'selfie_uploaded_at' => now(),
        ]);

        return response()->json(['message' => 'Identity selfie uploaded.']);
    }

    public function updateShift(Request $request)
    {
        $validated = $request->validate([
            'action' => ['required', 'in:start,stop,break'],
        ]);

        $user = $request->user();
        abort_unless($user->role === 'rider', 403);

        if ($validated['action'] === 'start') {
            if (! $user->shift_started_at) {
                $user->update(['shift_started_at' => now(), 'shift_break_started_at' => null]);
            }
        } elseif ($validated['action'] === 'stop') {
            $elapsed = 0;
            if ($user->shift_started_at) {
                $elapsed = now()->diffInSeconds($user->shift_started_at);
            }
            $user->update([
                'shift_seconds_total' => $user->shift_seconds_total + $elapsed,
                'shift_started_at' => null,
                'shift_break_started_at' => null,
            ]);
        } else {
            $user->update([
                'shift_break_started_at' => $user->shift_break_started_at ? null : now(),
            ]);
        }

        return response()->json(['settings' => $this->settings($user)]);
    }

    public function wallet(Request $request)
    {
        $user = $request->user();
        abort_unless($user->role === 'passenger', 403);

        return response()->json([
            'balance' => (float) $user->wallet_balance,
            'transactions' => DB::table('wallet_transactions')
                ->where('user_id', $user->id)
                ->orderByDesc('created_at')
                ->limit(30)
                ->get(['id', 'type', 'amount', 'description', 'created_at']),
        ]);
    }

    public function topUpWallet(Request $request)
    {
        if (app()->environment('production')) {
            abort(403, 'Direct wallet top-up is disabled in production. Please complete payment via the mobile money checkout.');
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1', 'max:500'],
        ]);

        $user = $request->user();
        abort_unless($user->role === 'passenger', 403);

        DB::transaction(function () use ($user, $validated) {
            $user = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $user->wallet_balance = (float) $user->wallet_balance + (float) $validated['amount'];
            $user->save();
            DB::table('wallet_transactions')->insert([
                'user_id' => $user->id,
                'type' => 'topup',
                'amount' => $validated['amount'],
                'description' => 'Wallet top-up (simulated sandbox)',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return $this->wallet($request);
    }

    public function submitSupport(Request $request)
    {
        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:120'],
            'message' => ['required', 'string', 'max:2000'],
        ]);

        DB::table('support_messages')->insert([
            'user_id' => $request->user()->id,
            ...$validated,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Support request submitted.']);
    }

    public function updateVehicle(Request $request)
    {
        $user = $request->user();
        abort_unless($user->role === 'rider', 403);
        $profile = $user->riderProfile;
        abort_if(! $profile, 404, 'Submit a rider profile first.');

        $validated = $request->validate([
            'vehicle_make' => ['nullable', 'string', 'max:80'],
            'vehicle_model' => ['nullable', 'string', 'max:80'],
            'vehicle_color' => ['nullable', 'string', 'max:40'],
            'license_expiry' => ['nullable', 'date'],
            'insurance_expiry' => ['nullable', 'date'],
            'vehicle_papers_expiry' => ['nullable', 'date'],
            'roadworthy_expiry' => ['nullable', 'date'],
        ]);
        $profile->update($validated);

        return response()->json(['message' => 'Vehicle and document details updated.', 'profile' => $profile->fresh()]);
    }

    public function incidentHistory(Request $request)
    {
        $incidents = TripIncident::query()
            ->where('created_by', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get(['id', 'category', 'summary', 'status', 'resolved_at', 'created_at']);

        return response()->json(['incidents' => $incidents]);
    }

    public function exportPersonalData(Request $request)
    {
        $user = $request->user()->load(['riderProfile', 'savedPlaces']);
        $export = [
            'exported_at' => now()->toIso8601String(),
            'account' => [
                'name' => $user->name,
                'phone' => $user->phone,
                'email' => $user->email,
                'role' => $user->role,
            ],
            'settings' => $this->settings($user),
            'rider_profile' => $user->riderProfile ? [
                'plate_number' => $user->riderProfile->plate_number,
                'verification_status' => $user->riderProfile->verification_status,
                'vehicle_make' => $user->riderProfile->vehicle_make,
                'vehicle_model' => $user->riderProfile->vehicle_model,
                'vehicle_color' => $user->riderProfile->vehicle_color,
            ] : null,
            'saved_places' => $user->savedPlaces->map(fn ($place) => $place->only(['name', 'label'])),
        ];

        return response()->json($export);
    }

    public function deleteAccount(Request $request)
    {
        $user = $request->user();
        $avatarPath = $user->avatar_path;
        $user->tokens()->delete();

        if ($avatarPath) {
            Storage::disk('local')->delete($avatarPath);
        }

        $user->delete();

        return response()->json(['message' => 'Account deleted.']);
    }

    private function settings($user): array
    {
        $firstName = $user->first_name;
        $lastName = $user->last_name;
        if (! $firstName && ! $lastName && $user->name) {
            $nameParts = preg_split('/\s+/', trim($user->name), 2) ?: [];
            $firstName = $nameParts[0] ?? null;
            $lastName = $nameParts[1] ?? null;
        }

        return [
            'push_notifications_enabled' => (bool) $user->push_notifications_enabled,
            'preferred_language' => $user->preferred_language,
            'shift_started_at' => $user->shift_started_at?->toIso8601String(),
            'shift_seconds_total' => $user->shift_seconds_total,
            'shift_break_started_at' => $user->shift_break_started_at?->toIso8601String(),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $user->email,
            'wallet_balance' => (float) $user->wallet_balance,
            'payment_method' => $user->payment_method ?: 'cash',
            'trusted_contact_name' => $user->trusted_contact_name,
            'trusted_contact_phone' => $user->trusted_contact_phone,
            'hide_exact_location' => (bool) $user->hide_exact_location,
            'emergency_alerts_enabled' => (bool) $user->emergency_alerts_enabled,
            'default_service_type' => $user->default_service_type ?: 'ride',
            'quiet_ride' => (bool) $user->quiet_ride,
            'extra_luggage' => (bool) $user->extra_luggage,
            'receipt_channel' => $user->receipt_channel ?: 'none',
            'automatic_rating_prompt' => (bool) $user->automatic_rating_prompt,
            'rider_request_radius_km' => (int) ($user->rider_request_radius_km ?: 10),
            'destination_requests_enabled' => (bool) $user->destination_requests_enabled,
            'preferred_areas' => $user->preferred_areas,
            'navigation_app' => $user->navigation_app ?: 'google_maps',
            'break_reminders_enabled' => (bool) $user->break_reminders_enabled,
            'alertness_prompts_enabled' => (bool) $user->alertness_prompts_enabled,
            'earnings_summary_period' => $user->earnings_summary_period ?: 'weekly',
            'withdrawal_account' => $user->withdrawal_account,
        ];
    }
}
