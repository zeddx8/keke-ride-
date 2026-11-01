<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TripIncidentNote extends Model
{
    protected $fillable = [
        'trip_incident_id',
        'created_by',
        'body',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function incident()
    {
        return $this->belongsTo(TripIncident::class, 'trip_incident_id');
    }
}
