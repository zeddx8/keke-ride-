<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreRiderProfileRequest;
use App\Models\RiderProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\ImageManager;
use RuntimeException;

class RiderProfileController extends Controller
{
    public function store(StoreRiderProfileRequest $request)
    {
        $user = $request->user();
        if ($user->cannot('submit', RiderProfile::class)) {
            return response()->json(['message' => 'Only riders without an active application can submit a profile.'], 403);
        }

        $profile = $user->riderProfile;
        $oldImagePaths = $profile
            ? [$profile->license_image_path, $profile->ghana_card_image_path]
            : [];
        $manager = new ImageManager(new Driver);

        // Process License Image: read, convert to JPEG (strips EXIF automatically), and save to local (private) disk
        $licenseFile = $request->file('license_image');
        $licenseImg = $manager->read($licenseFile->getRealPath());
        $licenseName = Str::random(40).'.jpg';
        $licensePath = 'profiles/'.$licenseName;
        if (! Storage::disk('local')->put($licensePath, $licenseImg->toJpeg(80)->toString())) {
            throw new RuntimeException('Failed to store the rider licence image.');
        }

        // Process Ghana Card Image
        $cardFile = $request->file('ghana_card_image');
        $cardImg = $manager->read($cardFile->getRealPath());
        $cardName = Str::random(40).'.jpg';
        $cardPath = 'profiles/'.$cardName;
        if (! Storage::disk('local')->put($cardPath, $cardImg->toJpeg(80)->toString())) {
            Storage::disk('local')->delete($licensePath);
            throw new RuntimeException('Failed to store the rider Ghana Card image.');
        }

        $profile ??= new RiderProfile(['user_id' => $user->id]);
        $profile->fill([
            'name' => $request->name,
            'license_number' => $request->license_number,
            'ghana_card_number' => $request->ghana_card_number,
            'plate_number' => $request->plate_number,
            'license_image_path' => $licensePath,
            'ghana_card_image_path' => $cardPath,
            'verification_status' => 'pending',
        ])->save();
        $user->update(['status' => 'offline']);

        foreach ($oldImagePaths as $oldImagePath) {
            if ($oldImagePath && ! Storage::disk('local')->delete($oldImagePath)) {
                Log::warning('Unable to delete a replaced rider profile image.', [
                    'rider_profile_id' => $profile->id,
                ]);
            }
        }

        return response()->json([
            'message' => 'Profile submitted successfully.',
            'profile' => $this->formatProfileResponse($profile),
        ], $oldImagePaths ? 200 : 201);
    }

    public function show(Request $request)
    {
        $profile = $request->user()->riderProfile;

        if (! $profile) {
            return response()->json(['message' => 'Profile not found.'], 404);
        }

        if ($request->user()->cannot('view', $profile)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return response()->json([
            'profile' => $this->formatProfileResponse($profile),
        ]);
    }

    public function showImage(Request $request, $filename)
    {
        // Enforce temporary signed URL validation
        if (! $request->hasValidSignature()) {
            abort(403, 'Invalid or expired signature.');
        }

        $path = 'profiles/'.$filename;
        if (! Storage::disk('local')->exists($path)) {
            abort(404);
        }

        return Storage::disk('local')->response($path);
    }

    private function formatProfileResponse(RiderProfile $profile)
    {
        // Generate a signed URL valid for 15 minutes
        $licenseUrl = URL::temporarySignedRoute(
            'profile.image', now()->addMinutes(15), ['filename' => basename($profile->license_image_path)]
        );
        $cardUrl = URL::temporarySignedRoute(
            'profile.image', now()->addMinutes(15), ['filename' => basename($profile->ghana_card_image_path)]
        );

        return [
            'id' => $profile->id,
            'name' => $profile->name,
            'plate_number' => $profile->plate_number,
            'verification_status' => $profile->verification_status,
            'license_image_url' => $licenseUrl,
            'ghana_card_image_url' => $cardUrl,
            'vehicle_make' => $profile->vehicle_make,
            'vehicle_model' => $profile->vehicle_model,
            'vehicle_color' => $profile->vehicle_color,
            'license_expiry' => $profile->license_expiry?->format('Y-m-d'),
            'insurance_expiry' => $profile->insurance_expiry?->format('Y-m-d'),
            'vehicle_papers_expiry' => $profile->vehicle_papers_expiry?->format('Y-m-d'),
            'roadworthy_expiry' => $profile->roadworthy_expiry?->format('Y-m-d'),
            // Omit sending the actual license/card numbers back to the client unless strictly necessary
        ];
    }
}
