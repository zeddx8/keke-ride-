<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Trip extends Model
{
    use HasFactory;

    protected $fillable = [
        'passenger_id',
        'rider_id',
        'dispatch_rider_id',
        'dispatch_expires_at',
        'pickup_point',
        'pickup_location',
        'landmark_note',
        'destination_point',
        'destination_location',
        'estimated_distance_km',
        'estimated_fare',
        'route_geometry',
        'status',
        'payment_method',
        'payment_status',
        'payment_collected_at',
        'completed_at',
        'share_token',
        'share_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'route_geometry' => 'array',
            'completed_at' => 'datetime',
            'payment_collected_at' => 'datetime',
            'share_expires_at' => 'datetime',
            'dispatch_expires_at' => 'datetime',
        ];
    }

    public function passenger()
    {
        return $this->belongsTo(User::class, 'passenger_id');
    }

    public function rider()
    {
        return $this->belongsTo(User::class, 'rider_id');
    }

    public function rating()
    {
        return $this->hasOne(TripRating::class);
    }

    public function incidents()
    {
        return $this->hasMany(TripIncident::class);
    }
}
