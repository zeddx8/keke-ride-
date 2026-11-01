<?php

namespace App\Http\Controllers;

use App\Models\AdminAuditLog;
use App\Models\RiderLocation;
use App\Models\RiderProfile;
use App\Models\Trip;
use App\Models\TripIncident;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminDashboardController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAdmin($request, 'dashboard.view');
        $this->authorizeAdmin($request, 'trips.view');
        $this->authorizeAdmin($request, 'riders.view');

        return response()->json([
            'stats' => $this->dashboardStats(),
            'pending_riders' => $this->pendingRiderApplications(),
            'recent_trips' => $this->getRecentTrips(),
        ]);
    }

    public function overview(Request $request)
    {
        $this->authorizeAdmin($request, 'dashboard.view');

        return response()->json(['stats' => $this->dashboardStats()]);
    }

    public function pendingRiders(Request $request)
    {
        $this->authorizeAdmin($request, 'riders.view');

        return response()->json(['pending_riders' => $this->pendingRiderApplications()]);
    }

    public function recentTrips(Request $request)
    {
        $this->authorizeAdmin($request, 'trips.view');

        return response()->json(['recent_trips' => $this->getRecentTrips()]);
    }

    public function activeTrips(Request $request)
    {
        $this->authorizeAdmin($request, 'trips.view');

        $trips = Trip::query()
            ->whereIn('status', ['searching', 'accepted', 'arrived', 'started'])
            ->with([
                'passenger:id,name,phone',
                'rider:id,name,phone',
                'rider.riderProfile:id,user_id,name,plate_number',
                'rider.riderLocation:id,rider_id,latitude,longitude,updated_at',
            ])
            ->select([
                'id',
                'passenger_id',
                'rider_id',
                'status',
                'pickup_location',
                'landmark_note',
                'destination_location',
                'estimated_distance_km',
                'estimated_fare',
                'created_at',
                'updated_at',
            ])
            ->selectRaw('ST_Y(pickup_point) as pickup_latitude, ST_X(pickup_point) as pickup_longitude')
            ->selectRaw('ST_Y(destination_point) as destination_latitude, ST_X(destination_point) as destination_longitude')
            ->orderByDesc('updated_at')
            ->limit(100)
            ->get()
            ->map(fn (Trip $trip) => [
                'id' => $trip->id,
                'status' => $trip->status,
                'pickup_location' => $trip->pickup_location,
                'landmark_note' => $trip->landmark_note,
                'destination_location' => $trip->destination_location,
                'pickup_latitude' => (float) $trip->pickup_latitude,
                'pickup_longitude' => (float) $trip->pickup_longitude,
                'destination_latitude' => (float) $trip->destination_latitude,
                'destination_longitude' => (float) $trip->destination_longitude,
                'estimated_distance_km' => (float) $trip->estimated_distance_km,
                'estimated_fare' => (float) $trip->estimated_fare,
                'created_at' => $trip->created_at,
                'updated_at' => $trip->updated_at,
                'passenger' => [
                    'name' => $trip->passenger?->name,
                    'phone' => $trip->passenger?->phone,
                ],
                'rider' => $trip->rider ? [
                    'name' => $trip->rider->riderProfile?->name ?? $trip->rider->name,
                    'phone' => $trip->rider->phone,
                    'plate_number' => $trip->rider->riderProfile?->plate_number,
                ] : null,
                'rider_location' => $trip->rider?->riderLocation ? [
                    'latitude' => (float) $trip->rider->riderLocation->latitude,
                    'longitude' => (float) $trip->rider->riderLocation->longitude,
                    'updated_at' => $trip->rider->riderLocation->updated_at,
                ] : null,
            ]);

        return response()->json(['active_trips' => $trips]);
    }

    public function review(Request $request, User $rider)
    {
        $this->authorizeAdmin($request, 'riders.review');

        if ($rider->role !== 'rider') {
            abort(404, 'Rider account not found.');
        }

        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
        ]);

        $profile = DB::transaction(function () use ($request, $rider, $validated) {
            $profile = RiderProfile::query()
                ->where('user_id', $rider->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($profile->verification_status !== 'pending') {
                throw ValidationException::withMessages([
                    'status' => ['Only pending rider applications can be reviewed.'],
                ]);
            }

            $profile->update(['verification_status' => $validated['status']]);
            $rider->update(['status' => 'offline']);
            RiderLocation::query()
                ->where('rider_id', $rider->id)
                ->update(['is_online' => false]);

            AdminAuditLog::record(
                $request->user(),
                'rider.'.$validated['status'],
                'rider_profile',
                $profile->id,
                'Rider application '.$validated['status'].' for rider #'.$rider->id.'.',
            );

            return $profile;
        });

        return response()->json([
            'message' => $validated['status'] === 'approved'
                ? 'Rider approved. They can now go online.'
                : 'Rider application rejected.',
            'rider_id' => $rider->id,
            'verification_status' => $profile->verification_status,
        ]);
    }

    public function users(Request $request)
    {
        $this->authorizeAdmin($request, 'accounts.manage');

        $validated = $request->validate([
            'q' => 'nullable|string|max:120',
            'role' => 'nullable|in:passenger,rider',
        ]);
        $query = User::query()
            ->select(['id', 'phone', 'role', 'status', 'is_suspended', 'suspension_reason', 'created_at'])
            ->whereIn('role', ['passenger', 'rider'])
            ->latest();

        if (isset($validated['q']) && $validated['q'] !== '') {
            $query->where('phone', 'like', '%'.$validated['q'].'%');
        }

        if (isset($validated['role'])) {
            $query->where('role', $validated['role']);
        }

        return response()->json($query->paginate(20));
    }

    public function createUser(Request $request)
    {
        $this->authorizeAdmin($request, 'accounts.manage');

        $validated = $request->validate([
            'phone' => ['required', 'string', 'regex:/^[0-9]{10,15}$/', Rule::unique('users', 'phone')],
            'role' => 'required|in:passenger,rider',
        ]);

        $user = DB::transaction(function () use ($request, $validated) {
            $user = User::create([
                'phone' => $validated['phone'],
                'role' => $validated['role'],
                'status' => $validated['role'] === 'rider' ? 'offline' : 'active',
            ]);

            AdminAuditLog::record(
                $request->user(),
                'account.created',
                'user',
                $user->id,
                'Created '.$validated['role'].' account #'.$user->id.'.',
            );

            return $user;
        });

        return response()->json([
            'message' => $validated['role'] === 'rider'
                ? 'Rider account created. They must use Forgot password to verify their phone and set a password, then submit a profile for approval.'
                : 'Passenger account created. They must use Forgot password to verify their phone and set an initial password.',
            'user' => $user->only(['id', 'phone', 'role', 'status', 'created_at']),
        ], 201);
    }

    public function updateAccountSuspension(Request $request, User $account)
    {
        $this->authorizeAdmin($request, 'accounts.manage');

        $validated = $request->validate([
            'suspended' => ['required', 'boolean'],
            'reason' => ['required_if:suspended,true', 'nullable', 'string', 'min:5', 'max:500'],
        ]);
        abort_if(! in_array($account->role, ['passenger', 'rider'], true), 404, 'Passenger or rider account not found.');

        DB::transaction(function () use ($request, $account, $validated) {
            $lockedUsers = User::query()
                ->whereIn('id', [$request->user()->id, $account->id])
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');
            $actor = $lockedUsers->get($request->user()->id);
            $lockedAccount = $lockedUsers->get($account->id);

            abort_if(! $actor?->hasAdminPermission('accounts.manage'), 403, 'Your administrator role does not allow this action.');
            abort_if(! $lockedAccount || ! in_array($lockedAccount->role, ['passenger', 'rider'], true), 404, 'Passenger or rider account not found.');

            $shouldBeSuspended = (bool) $validated['suspended'];
            if ((bool) $lockedAccount->is_suspended === $shouldBeSuspended) {
                return;
            }

            if ($shouldBeSuspended) {
                $lockedAccount->update([
                    'is_suspended' => true,
                    'suspension_reason' => trim($validated['reason']),
                    'status' => $lockedAccount->role === 'rider' ? 'offline' : $lockedAccount->status,
                ]);
                if ($lockedAccount->role === 'rider') {
                    RiderLocation::query()
                        ->where('rider_id', $lockedAccount->id)
                        ->update(['is_online' => false]);
                }
                $lockedAccount->tokens()->delete();
            } else {
                $lockedAccount->update([
                    'is_suspended' => false,
                    'suspension_reason' => null,
                ]);
            }

            AdminAuditLog::record(
                $actor,
                $shouldBeSuspended ? 'account.suspended' : 'account.restored',
                'user',
                $lockedAccount->id,
                ($shouldBeSuspended ? 'Suspended' : 'Restored').' '.$lockedAccount->role.' account #'.$lockedAccount->id.'.',
            );
        });

        return response()->json([
            'message' => $validated['suspended']
                ? 'Account suspended and active tokens revoked.'
                : 'Account restored. The user can sign in again.',
        ]);
    }

    private function authorizeAdmin(Request $request, string $permission): void
    {
        if (! $request->user()->hasAdminPermission($permission)) {
            abort(403, 'Your administrator role does not allow this action.');
        }
    }

    private function dashboardStats(): array
    {
        $today = now()->startOfDay();

        return [
            'passengers' => User::query()->where('role', 'passenger')->count(),
            'riders' => User::query()->where('role', 'rider')->count(),
            'pending_rider_profiles' => RiderProfile::query()
                ->where('verification_status', 'pending')
                ->count(),
            'open_incidents' => TripIncident::query()->where('status', 'open')->count(),
            'trips_today' => Trip::query()->where('created_at', '>=', $today)->count(),
            'completed_trips' => Trip::query()->where('status', 'completed')->count(),
        ];
    }

    private function pendingRiderApplications()
    {
        return RiderProfile::query()
            ->with('user:id,phone')
            ->where('verification_status', 'pending')
            ->latest()
            ->limit(20)
            ->get()
            ->map(fn (RiderProfile $profile) => [
                'id' => $profile->id,
                'user_id' => $profile->user_id,
                'phone' => $profile->user->phone,
                'name' => $profile->name,
                'plate_number' => $profile->plate_number,
                'created_at' => $profile->created_at,
                'license_image_url' => $this->signedImageUrl($profile->license_image_path),
                'ghana_card_image_url' => $this->signedImageUrl($profile->ghana_card_image_path),
            ])
            ->values();
    }

    private function getRecentTrips()
    {
        return Trip::query()
            ->select([
                'id',
                'status',
                'pickup_location',
                'destination_location',
                'estimated_fare',
                'created_at',
            ])
            ->latest()
            ->limit(10)
            ->get();
    }

    private function signedImageUrl(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        return URL::temporarySignedRoute(
            'profile.image',
            now()->addMinutes(15),
            ['filename' => basename($path)],
        );
    }
}
