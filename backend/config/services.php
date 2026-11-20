<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'place_search' => [
        'url' => env('PLACE_SEARCH_URL', 'https://nominatim.openstreetmap.org/search'),
        'user_agent' => env('PLACE_SEARCH_USER_AGENT', 'KekeRide/1.0'),
        'country_codes' => env('PLACE_SEARCH_COUNTRY_CODES', 'gh'),
        'timeout_seconds' => (int) env('PLACE_SEARCH_TIMEOUT_SECONDS', 8),
        'connect_timeout_seconds' => (int) env('PLACE_SEARCH_CONNECT_TIMEOUT_SECONDS', 3),
        'cache_ttl_seconds' => (int) env('PLACE_SEARCH_CACHE_TTL_SECONDS', 600),
        'provider_interval_seconds' => (int) env('PLACE_SEARCH_PROVIDER_INTERVAL_SECONDS', 1),
    ],

    'routing' => [
        'url' => env('ROUTING_URL', 'https://router.project-osrm.org'),
        'timeout_seconds' => (int) env('ROUTING_TIMEOUT_SECONDS', 8),
        'connect_timeout_seconds' => (int) env('ROUTING_CONNECT_TIMEOUT_SECONDS', 3),
        'cache_ttl_seconds' => (int) env('ROUTING_CACHE_TTL_SECONDS', 300),
    ],

    'hubtel' => [
        'url' => env('HUBTEL_SMS_URL', 'https://smsc.hubtel.com/v1/messages/send'),
        'client_id' => env('HUBTEL_CLIENT_ID'),
        'client_secret' => env('HUBTEL_CLIENT_SECRET'),
        'sender_id' => env('HUBTEL_SENDER_ID', 'KekeRide'),
        'timeout_seconds' => (int) env('HUBTEL_SMS_TIMEOUT_SECONDS', 10),
        'connect_timeout_seconds' => (int) env('HUBTEL_SMS_CONNECT_TIMEOUT_SECONDS', 5),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
