<?php

namespace App\Jobs;

use App\Events\TripRequested;
use App\Events\TripStatusUpdated;
use App\Models\Trip;
use App\Models\User;
use App\Services\FirebasePushService;
use Illuminate\Bus\Queueable;
use Illuminate\Broadcasting\BroadcastException;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

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
        $dispatchInfo = DB::transaction(function () {
            $trip = Trip::query()->whereKey($this->trip->id)->lockForUpdate()->first();

            if (! $trip || $trip->status !== 'searching') {
                return null;
            }

            $nextRiderId = array_shift($this->riderIds);

            if (! $nextRiderId) {
                $trip->update([
                    'status' => 'cancelled',
                    'dispatch_rider_id' => null,
                    'dispatch_expires_at' => null,
                ]);

                return ['cancelled' => true, 'trip' => $trip];
            }

            $trip->update([
                'dispatch_rider_id' => $nextRiderId,
                'dispatch_expires_at' => now()->addSeconds($this->timeoutSeconds),
            ]);

            return ['rider_id' => $nextRiderId, 'trip' => $trip];
        });

        if (! $dispatchInfo) {
            return;
        }

        if (! empty($dispatchInfo['cancelled'])) {
            event(new TripStatusUpdated(
                $dispatchInfo['trip'],
                'No riders accepted your request. Please try again.',
            ));
            return;
        }

        $nextRiderId = $dispatchInfo['rider_id'];
        $trip = $dispatchInfo['trip'];

        try {
            event(new TripRequested($trip, $nextRiderId, $this->timeoutSeconds));
        } catch (BroadcastException $exception) {
            report($exception);
        }

        $rider = User::find($nextRiderId);
        if ($rider) {
            app(FirebasePushService::class)->sendTripRequest(
                $rider,
                $trip,
                $this->timeoutSeconds,
            );
        }

        self::dispatch($trip, $this->riderIds)->delay(now()->addSeconds($this->timeoutSeconds));
    }
}
