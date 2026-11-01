<?php

namespace App\Jobs;

use App\Events\TripRequested;
use App\Events\TripStatusUpdated;
use App\Models\Trip;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class DispatchRideJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $trip;
    public $riderIds;
    public $timeoutSeconds = 20;

    public function __construct(Trip $trip, array $riderIds)
    {
        $this->trip = $trip;
        $this->riderIds = $riderIds;
    }

    public function handle(): void
    {
        // 1. Refresh trip to get current status
        $this->trip->refresh();

        // 2. If the trip was cancelled by passenger or accepted by a previous rider, halt dispatch.
        if ($this->trip->status !== 'searching') {
            return; 
        }

        // 3. Get the next available rider in the queue
        $nextRiderId = array_shift($this->riderIds);

        if (!$nextRiderId) {
            $this->trip->update(['status' => 'cancelled']);
            event(new TripStatusUpdated(
                $this->trip,
                'No riders accepted your request. Please try again.',
            ));
            return;
        }

        // 4. Ping this rider over WebSockets (handled instantly via ShouldBroadcastNow)
        event(new TripRequested($this->trip, $nextRiderId, $this->timeoutSeconds));

        // 5. Dispatch this exact job again, delayed by 20 seconds, with the remaining riders
        // If the current rider accepts, the trip status changes, and this delayed job will harmlessly abort at Step 2.
        self::dispatch($this->trip, $this->riderIds)->delay(now()->addSeconds($this->timeoutSeconds));
    }
}