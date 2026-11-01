<?php

return [
    'base_fare' => (float) env('RIDE_BASE_FARE', 5.00),
    'fare_per_km' => (float) env('RIDE_FARE_PER_KM', 3.00),
    'rider_location_freshness_minutes' => (int) env('RIDE_LOCATION_FRESHNESS_MINUTES', 5),
];
