<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MapProviderHealthTest extends TestCase
{
    public function test_provider_health_command_checks_both_configured_providers(): void
    {
        Cache::flush();
        Http::fake([
            'router.project-osrm.org/route/*' => Http::response([
                'routes' => [[
                    'distance' => 2000,
                    'duration' => 300,
                    'geometry' => ['type' => 'LineString', 'coordinates' => [[-1.2466, 5.1053], [-1.25, 5.11]]],
                ]],
            ]),
            'nominatim.openstreetmap.org/search*' => Http::response([
                ['display_name' => 'Cape Coast, Ghana', 'lat' => '5.1053', 'lon' => '-1.2466'],
            ]),
        ]);

        $this->artisan('providers:check')
            ->expectsOutput('Road routing: available')
            ->expectsOutput('Place search: available')
            ->assertExitCode(0);

        Http::assertSentCount(2);
    }

    public function test_provider_health_command_fails_when_providers_are_not_configured_for_production(): void
    {
        config(['app.env' => 'production']);
        Http::fake();

        $this->artisan('providers:check')
            ->expectsOutputToContain('Road routing: Road routing is not configured for production.')
            ->expectsOutputToContain('Place search: Place search is not configured for production.')
            ->assertExitCode(1);

        Http::assertNothingSent();
    }
}
