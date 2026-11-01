<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TripIncident extends Model
{
    protected $fillable = [
        'trip_id',
        'created_by',
        'resolved_by',
        'assigned_to',
        'assigned_at',
        'first_response_at',
        'category',
        'summary',
        'reporter_message',
        'status',
        'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
            'assigned_at' => 'datetime',
            'first_response_at' => 'datetime',
        ];
    }

    public function trip()
    {
        return $this->belongsTo(Trip::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function resolver()
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function notes()
    {
        return $this->hasMany(TripIncidentNote::class);
    }
}
