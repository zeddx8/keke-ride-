<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

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
        'password',
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
    ];

    protected $hidden = [
        'otp_code',
        'password',
    ];

    protected function casts(): array
    {
        return [
            'otp_expires_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'password' => 'hashed',
            'admin_active' => 'boolean',
            'is_suspended' => 'boolean',
        ];
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
