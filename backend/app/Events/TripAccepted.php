<?php

namespace App\Events;

use App\Models\Trip;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TripAccepted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $trip;

    public function __construct(Trip $trip)
    {
        $this->trip = $trip;
    }

    public function broadcastOn(): array
    {
        // Broadcast directly to the passenger who requested the trip
        return [
            new PrivateChannel('passenger.' . $this->trip->passenger_id),
        ];
    }

    public function broadcastWith(): array
    {
        return [
            'trip' => [
                'id' => $this->trip->id,
                'status' => $this->trip->status,
                'rider_id' => $this->trip->rider_id,
                'estimated_fare' => $this->trip->estimated_fare,
                'estimated_distance_km' => $this->trip->estimated_distance_km,
            ],
            'message' => 'Your Keke is on the way!',
        ];
    }

    public function broadcastAs(): string
    {
        return 'TripAccepted';
    }
}