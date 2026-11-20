<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class HubtelSmsService
{
    public function isConfigured(): bool
    {
        return filled(config('services.hubtel.client_id'))
            && filled(config('services.hubtel.client_secret'))
            && filled(config('services.hubtel.sender_id'));
    }

    public function send(string $phone, string $message): void
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Hubtel SMS delivery is not configured.');
        }

        $response = Http::acceptJson()
            ->withBasicAuth(
                (string) config('services.hubtel.client_id'),
                (string) config('services.hubtel.client_secret'),
            )
            ->timeout((int) config('services.hubtel.timeout_seconds', 10))
            ->connectTimeout((int) config('services.hubtel.connect_timeout_seconds', 5))
            ->post((string) config('services.hubtel.url'), [
                'From' => (string) config('services.hubtel.sender_id'),
                'To' => $this->normalizeGhanaPhone($phone),
                'Content' => $message,
            ]);

        if ($response->failed()) {
            throw new RuntimeException(
                'Hubtel rejected the SMS request (HTTP '.$response->status().').'
            );
        }
    }

    private function normalizeGhanaPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';
        if (str_starts_with($digits, '233')) {
            return $digits;
        }

        if (str_starts_with($digits, '0')) {
            return '233'.substr($digits, 1);
        }

        return $digits;
    }
}
