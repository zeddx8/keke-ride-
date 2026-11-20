<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Support\Facades\URL;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    public const ADMIN_ROLES = ['super_admin', 'operations', 'support'];

    private const ADMIN_PERMISSIONS = [
        'super_admin' => [
            'dashboard.view',
            'trips.view',
            'incidents.view',
            'incidents.create',
            'incidents.note',
            'incidents.resolve',
            'incidents.assign',
            'riders.view',
            'riders.review',
            'accounts.manage',
            'reports.view',
            'audit.view',
            'staff.manage',
        ],
        'operations' => [
            'dashboard.view',
            'trips.view',
            'incidents.view',
            'incidents.create',
            'incidents.note',
            'incidents.resolve',
            'incidents.assign',
            'riders.view',
            'riders.review',
            'audit.view',
            'reports.view',
        ],
        'support' => [
            'dashboard.view',
            'incidents.view',
            'incidents.note',
            'incidents.assign',
        ],
    ];

    protected static function booted(): void
    {
        static::creating(function (self $user) {
            if ($user->role === 'admin' && $user->admin_role === null) {
                $user->admin_role = 'support';
            }
            if ($user->role === 'admin' && $user->admin_active === null) {
                $user->admin_active = true;
            }
        });
    }

    protected $fillable = [
        'phone',
        'name',
        'avatar_path',
        'password',
        'fcm_token',
        'fcm_token_updated_at',
        'phone_verified_at',
        'role',
        'admin_role',
        'admin_active',
        'is_suspended',
        'suspension_reason',
        'status',
        'otp_code',
        'otp_expires_at',
        'otp_purpose',
        'push_notifications_enabled',
        'preferred_language',
        'ride_history_deleted_at',
        'shift_started_at',
        'shift_seconds_total',
        'shift_break_started_at',
        'first_name',
        'last_name',
        'email',
        'wallet_balance',
        'payment_method',
        'trusted_contact_name',
        'trusted_contact_phone',
        'hide_exact_location',
        'emergency_alerts_enabled',
        'default_service_type',
        'quiet_ride',
        'extra_luggage',
        'receipt_channel',
        'automatic_rating_prompt',
        'rider_request_radius_km',
        'destination_requests_enabled',
        'preferred_areas',
        'navigation_app',
        'break_reminders_enabled',
        'alertness_prompts_enabled',
        'earnings_summary_period',
        'withdrawal_account',
    ];

    protected $hidden = [
        'otp_code',
        'password',
        'avatar_path',
    ];

    protected $appends = ['avatar_url'];

    protected function casts(): array
    {
        return [
            'push_notifications_enabled' => 'boolean',
            'ride_history_deleted_at' => 'datetime',
            'shift_started_at' => 'datetime',
            'shift_break_started_at' => 'datetime',
            'otp_expires_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'password' => 'hashed',
            'fcm_token_updated_at' => 'datetime',
            'admin_active' => 'boolean',
            'is_suspended' => 'boolean',
            'wallet_balance' => 'decimal:2',
            'hide_exact_location' => 'boolean',
            'emergency_alerts_enabled' => 'boolean',
            'quiet_ride' => 'boolean',
            'extra_luggage' => 'boolean',
            'automatic_rating_prompt' => 'boolean',
            'destination_requests_enabled' => 'boolean',
            'break_reminders_enabled' => 'boolean',
            'alertness_prompts_enabled' => 'boolean',
            'rider_request_radius_km' => 'integer',
        ];
    }

    public function getAvatarUrlAttribute(): ?string
    {
        if (! $this->avatar_path) {
            return null;
        }

        return URL::temporarySignedRoute(
            'profile.avatar',
            now()->addMinutes(15),
            ['filename' => basename($this->avatar_path)],
        );
    }

    public function hasAdminPermission(string $permission): bool
    {
        if ($this->role !== 'admin' || ! $this->admin_active) {
            return false;
        }

        $adminRole = $this->admin_role ?? 'support';

        return in_array($permission, self::ADMIN_PERMISSIONS[$adminRole] ?? [], true);
    }

    public function riderProfile()
    {
        return $this->hasOne(RiderProfile::class);
    }

    public function savedPlaces()
    {
        return $this->hasMany(SavedPlace::class);
    }

    public function riderLocation()
    {
        return $this->hasOne(RiderLocation::class, 'rider_id');
    }

    public function tripsAsPassenger()
    {
        return $this->hasMany(Trip::class, 'passenger_id');
    }

    public function tripsAsRider()
    {
        return $this->hasMany(Trip::class, 'rider_id');
    }

    public function ratingsGiven()
    {
        return $this->hasMany(TripRating::class, 'passenger_id');
    }

    public function ratingsReceived()
    {
        return $this->hasMany(TripRating::class, 'rider_id');
    }
}
