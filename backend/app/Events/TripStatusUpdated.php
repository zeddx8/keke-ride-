<?php

namespace App\Events;

use App\Models\Trip;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TripStatusUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Trip $trip, public ?string $message = null)
    {
    }

    public function broadcastOn(): array
    {
        $channels = [
            new PrivateChannel('passenger.' . $this->trip->passenger_id),
        ];

        if ($this->trip->dispatch_rider_id) {
            $channels[] = new PrivateChannel('rider.' . $this->trip->dispatch_rider_id);
        }

        if ($this->trip->rider_id) {
            $channels[] = new PrivateChannel('rider.' . $this->trip->rider_id);
        }

        return $channels;
    }

    public function broadcastWith(): array
    {
        return [
            'trip' => [
                'id' => $this->trip->id,
                'status' => $this->trip->status,
                'rider_id' => $this->trip->rider_id,
                'message' => $this->message,
            ],
        ];
    }

    public function broadcastAs(): string
    {
        return 'TripStatusUpdated';
    }
}
