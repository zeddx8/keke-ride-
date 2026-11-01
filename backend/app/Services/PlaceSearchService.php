<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PlaceSearchService
{
    /**
     * @return array<int, array{label: string, latitude: float, longitude: float}>
     */
    public function search(string $query, bool $useCache = true): array
    {
        $cacheKey = 'place-search:'.hash('sha256', mb_strtolower(trim($query)));
        $url = (string) config('services.place_search.url');
        $this->ensureProductionProviderAllowed($url);

        $fetchPlaces = fn (): array => $this->fetchPlaces($query, $url);
        if (! $useCache) {
            return $fetchPlaces();
        }

        return Cache::remember(
            $cacheKey,
            now()->addSeconds(max(1, (int) config('services.place_search.cache_ttl_seconds', 600))),
            $fetchPlaces,
        );
    }

    private function fetchPlaces(string $query, string $url): array
    {
        $interval = max(1, (int) config('services.place_search.provider_interval_seconds', 1));
        if (! Cache::add('place-search:provider-rate-limit', true, now()->addSeconds($interval))) {
            throw new TripRoutingException('Place search is receiving requests too quickly. Please try again shortly.', 429);
        }

        try {
            $response = Http::withOptions(['force_ip_resolve' => 'v4'])
                ->withUserAgent((string) config('services.place_search.user_agent'))
                ->acceptJson()
                ->connectTimeout(max(1, (int) config('services.place_search.connect_timeout_seconds', 3)))
                ->timeout(max(1, (int) config('services.place_search.timeout_seconds', 8)))
                ->get($url, [
                    'q' => $query,
                    'format' => 'jsonv2',
                    'limit' => 5,
                    'addressdetails' => 1,
                    'countrycodes' => config('services.place_search.country_codes'),
                ]);
        } catch (ConnectionException $exception) {
            Log::warning('Place search provider could not be reached.', [
                'exception' => $exception->getMessage(),
            ]);

            throw new TripRoutingException('Place search is temporarily unavailable. Please try again.', 503);
        }

        if (! $response->successful() || ! is_array($response->json())) {
            Log::warning('Place search provider returned an unsuccessful response.', [
                'status' => $response->status(),
            ]);
            throw new TripRoutingException('Place search is temporarily unavailable. Please try again.', 503);
        }

        return collect($response->json())
            ->filter(fn ($place) => is_array($place)
                && is_string($place['display_name'] ?? null)
                && is_numeric($place['lat'] ?? null)
                && is_numeric($place['lon'] ?? null))
            ->map(fn (array $place) => [
                'label' => mb_substr($place['display_name'], 0, 255),
                'latitude' => (float) $place['lat'],
                'longitude' => (float) $place['lon'],
            ])
            ->values()
            ->all();
    }

    private function ensureProductionProviderAllowed(string $url): void
    {
        $host = strtolower(rtrim((string) parse_url($url, PHP_URL_HOST), '.'));
        if (config('app.env') === 'production' && $host === 'nominatim.openstreetmap.org') {
            Log::error('The public Nominatim service cannot be used for production place search.');
            throw new TripRoutingException('Place search is not configured for production.', 503);
        }
    }
}
