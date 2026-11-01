<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminAccountIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user?->is_suspended) {
            abort(403, 'This account has been suspended. Contact Keke Ride support.');
        }

        if ($user?->role === 'admin' && ! $user->admin_active) {
            abort(403, 'This administrator account has been deactivated.');
        }

        return $next($request);
    }
}
