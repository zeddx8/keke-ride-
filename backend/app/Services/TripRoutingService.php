<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TripRoutingService
{
    /**
     * @return array{distance_km: float, duration_minutes: float, geometry: array<int, array{0: float, 1: float}>}
     */
    public function route(
        float $pickupLat,
        float $pickupLng,
        float $destinationLat,
        float $destinationLng,
        bool $useCache = true,
    ): array {
        $baseUrl = rtrim((string) config('services.routing.url'), '/');
        $coordinates = sprintf(
            '%.7F,%.7F;%.7F,%.7F',
            $pickupLng,
            $pickupLat,
            $destinationLng,
            $destinationLat,
        );
        $this->ensureProductionProviderAllowed($baseUrl);

        $fetchRoute = fn (): array => $this->fetchRoute($baseUrl, $coordinates);
        if (! $useCache) {
            return $fetchRoute();
        }

        $cacheKey = 'trip-route:v1:'.hash('sha256', $coordinates);

        return Cache::remember(
            $cacheKey,
            now()->addSeconds(max(1, (int) config('services.routing.cache_ttl_seconds', 300))),
            $fetchRoute,
        );
    }

    private function fetchRoute(string $baseUrl, string $coordinates): array
    {
        try {
            $response = Http::withOptions(['force_ip_resolve' => 'v4'])
                ->connectTimeout(max(1, (int) config('services.routing.connect_timeout_seconds', 3)))
                ->timeout(max(1, (int) config('services.routing.timeout_seconds', 8)))
                ->get("{$baseUrl}/route/v1/driving/{$coordinates}", [
                    'overview' => 'full',
                    'geometries' => 'geojson',
                    'steps' => 'false',
                ]);
        } catch (ConnectionException $exception) {
            Log::warning('Trip route provider could not be reached.', [
                'exception' => $exception->getMessage(),
            ]);

            throw new TripRoutingException('Road routing is temporarily unavailable. Please try again.', 503);
        }

        if (! $response->successful()) {
            Log::warning('Trip route provider returned an unsuccessful response.', [
                'status' => $response->status(),
            ]);
            throw new TripRoutingException('Road routing is temporarily unavailable. Please try again.', 503);
        }

        $route = $response->json('routes.0');
        $coordinates = $route['geometry']['coordinates'] ?? null;
        if (
            ! is_array($route)
            || ! is_numeric($route['distance'] ?? null)
            || ! is_numeric($route['duration'] ?? null)
            || ! is_array($coordinates)
            || count($coordinates) < 2
        ) {
            throw new TripRoutingException('No drivable route was found between those locations.', 422);
        }

        $geometry = [];
        foreach ($coordinates as $coordinate) {
            if (
                ! is_array($coordinate)
                || count($coordinate) < 2
                || ! is_numeric($coordinate[0])
                || ! is_numeric($coordinate[1])
            ) {
                throw new TripRoutingException('Road routing is temporarily unavailable. Please try again.', 503);
            }
            $geometry[] = [(float) $coordinate[0], (float) $coordinate[1]];
        }

        return [
            'distance_km' => round(((float) $route['distance']) / 1000, 2),
            'duration_minutes' => round(((float) $route['duration']) / 60, 1),
            'geometry' => $geometry,
        ];
    }

    private function ensureProductionProviderAllowed(string $baseUrl): void
    {
        $host = strtolower(rtrim((string) parse_url($baseUrl, PHP_URL_HOST), '.'));
        if (config('app.env') === 'production' && $host === 'router.project-osrm.org') {
            Log::error('The public OSRM demo server cannot be used for production routing.');
            throw new TripRoutingException('Road routing is not configured for production.', 503);
        }
    }
}
