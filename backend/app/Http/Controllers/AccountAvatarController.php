<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\ImageManager;
use RuntimeException;

class AccountAvatarController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $user = $request->user();
        $oldPath = $user->avatar_path;
        $manager = new ImageManager(new Driver);
        $image = $manager->read($validated['avatar']->getRealPath());

        $filename = Str::random(40).'.jpg';
        $path = 'avatars/'.$filename;
        if (! Storage::disk('local')->put($path, $image->cover(400, 400)->toJpeg(82)->toString())) {
            throw new RuntimeException('Failed to store profile image.');
        }

        $user->update(['avatar_path' => $path]);
        if ($oldPath) {
            Storage::disk('local')->delete($oldPath);
        }

        return response()->json([
            'message' => 'Profile image updated.',
            'avatar_url' => $user->avatar_url,
        ]);
    }

    public function destroy(Request $request)
    {
        $user = $request->user();
        if ($user->avatar_path) {
            Storage::disk('local')->delete($user->avatar_path);
        }
        $user->update(['avatar_path' => null]);

        return response()->json(['message' => 'Profile image removed.', 'avatar_url' => null]);
    }

    public function show(Request $request, string $filename)
    {
        if (! $request->hasValidSignature()) {
            abort(403, 'Invalid or expired signature.');
        }

        $path = 'avatars/'.$filename;
        if (! Storage::disk('local')->exists($path)) {
            abort(404);
        }

        return Storage::disk('local')->response($path);
    }
}
