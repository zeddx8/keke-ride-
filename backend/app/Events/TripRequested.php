<?php

namespace App\Events;

use App\Models\Trip;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

class TripRequested implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $trip;
    public $riderId;
    public $timeoutSeconds;

    public function __construct(Trip $trip, int $riderId, int $timeoutSeconds = 20)
    {
        $this->trip = $trip;
        $this->riderId = $riderId;
        $this->timeoutSeconds = $timeoutSeconds;
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('rider.' . $this->riderId),
        ];
    }

    public function broadcastWith(): array
    {
        // Extract standard latitude/longitude from the MySQL spatial points
        $coords = DB::selectOne("
            SELECT 
                ST_Y(pickup_point) as pickup_lat, 
                ST_X(pickup_point) as pickup_lng, 
                ST_Y(destination_point) as destination_lat, 
                ST_X(destination_point) as destination_lng 
            FROM trips 
            WHERE id = ?
        ", [$this->trip->id]);

        // Strip out passenger PII; only broadcast the necessary dispatch data
        return [
            'trip_id' => $this->trip->id,
            'pickup_lat' => $coords->pickup_lat,
            'pickup_lng' => $coords->pickup_lng,
            'landmark_note' => $this->trip->landmark_note,
            'destination_lat' => $coords->destination_lat,
            'destination_lng' => $coords->destination_lng,
            'pickup_location' => $this->trip->pickup_location,
            'destination_location' => $this->trip->destination_location,
            'estimated_fare' => $this->trip->estimated_fare,
            'estimated_distance_km' => $this->trip->estimated_distance_km,
            'timeout_seconds' => $this->timeoutSeconds,
        ];
    }

    // Explicitly define the broadcast name to prevent namespace mismatch in React
    public function broadcastAs(): string
    {
        return 'TripRequested';
    }
}