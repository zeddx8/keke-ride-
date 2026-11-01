<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class UserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'phone' => '02'.$this->faker->randomNumber(8, true),
            'role' => 'passenger',
            'admin_role' => fn (array $attributes) => ($attributes['role'] ?? 'passenger') === 'admin'
                ? 'super_admin'
                : null,
            'status' => 'active',
        ];
    }
}
