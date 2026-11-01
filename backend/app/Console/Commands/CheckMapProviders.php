<?php

namespace App\Console\Commands;

use App\Services\PlaceSearchService;
use App\Services\TripRoutingException;
use App\Services\TripRoutingService;
use Illuminate\Console\Command;

class CheckMapProviders extends Command
{
    protected $signature = 'providers:check';

    protected $description = 'Check that configured place-search and road-routing providers are available';

    public function handle(TripRoutingService $routing, PlaceSearchService $places): int
    {
        $failed = false;

        $this->checkProvider('Road routing', function () use ($routing): void {
            $routing->route(5.1053, -1.2466, 5.11, -1.25, false);
        }, $failed);

        $this->checkProvider('Place search', function () use ($places): void {
            $places->search('Cape Coast, Ghana', false);
        }, $failed);

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function checkProvider(string $name, callable $check, bool &$failed): void
    {
        try {
            $check();
            $this->info("{$name}: available");
        } catch (TripRoutingException $exception) {
            $failed = true;
            $this->error("{$name}: {$exception->getMessage()}");
        }
    }
}
