<?php

namespace App\Events;

use App\Models\Trip;
use App\Models\User;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class RiderLocationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $tripId;
    public $latitude;
    public $longitude;
    public $riderName;
    public $plateNumber;

    public function __construct(int $tripId, float $latitude, float $longitude, User $rider)
    {
        $profile = $rider->riderProfile;
        $this->tripId = $tripId;
        $this->latitude = $latitude;
        $this->longitude = $longitude;
        $this->riderName = $profile?->name;
        $this->plateNumber = $profile?->plate_number;
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('trip.' . $this->tripId),
        ];
    }

    public function broadcastWith(): array
    {
        return [
            'trip_id' => $this->tripId,
            'lat' => $this->latitude,
            'lng' => $this->longitude,
            'rider_name' => $this->riderName,
            'plate_number' => $this->plateNumber,
        ];
    }

    public function broadcastAs(): string
    {
        return 'RiderLocationUpdated';
    }
}