<?php

namespace App\Policies;

use App\Models\RiderProfile;
use App\Models\User;

class RiderProfilePolicy
{
    public function view(User $user, RiderProfile $profile): bool
    {
        // Admin can view all; riders can only view their own
        return $user->role === 'admin' || $user->id === $profile->user_id;
    }

    public function submit(User $user): bool
    {
        if ($user->role !== 'rider') {
            return false;
        }

        $profile = RiderProfile::query()->where('user_id', $user->id)->first();

        return ! $profile || $profile->verification_status === 'rejected';
    }
}
