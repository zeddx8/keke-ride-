<?php

use App\Http\Controllers\AdminAuditLogController;
use App\Http\Controllers\AdminDashboardController;
use App\Http\Controllers\AdminIncidentController;
use App\Http\Controllers\AdminReportController;
use App\Http\Controllers\AdminStaffController;
use App\Http\Controllers\AccountAvatarController;
use App\Http\Controllers\AccountSettingsController;
use App\Http\Controllers\Auth\OtpController;
use App\Http\Controllers\LocationController;
use App\Http\Controllers\RiderProfileController;
use App\Http\Controllers\SavedPlaceController;
use App\Http\Controllers\TripController;
use App\Http\Controllers\TripIncidentController;
use App\Http\Controllers\TripRatingController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

// Expose the broadcasting authentication route for Laravel Echo/Reverb
Broadcast::routes(['middleware' => ['auth:sanctum', 'admin.active']]);

// Public Routes (No login required)
Route::middleware(['throttle:60,1'])->group(function () {
    Route::post('/auth/register', [OtpController::class, 'register'])->middleware('throttle:10,1');
    Route::post('/auth/login', [OtpController::class, 'login'])->middleware('throttle:10,1');
    Route::post('/auth/verify-registration', [OtpController::class, 'verifyRegistration'])->middleware('throttle:10,1');
    Route::post('/auth/resend-registration-code', [OtpController::class, 'resendRegistrationOtp'])->middleware('throttle:10,1');
    Route::post('/auth/forgot-password', [OtpController::class, 'forgotPassword'])->middleware('throttle:10,1');
    Route::post('/auth/reset-password', [OtpController::class, 'resetPassword'])->middleware('throttle:10,1');
});

Route::middleware(['throttle:30,1'])->get('/trip-share/{token}', [TripController::class, 'publicShare']);
Route::get('/images/avatars/{filename}', [AccountAvatarController::class, 'show'])
    ->name('profile.avatar');

// Protected Routes (Login required)
Route::middleware(['auth:sanctum', 'admin.active'])->group(function () {
    Route::post('/auth/logout', function (Request $request) {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Signed out successfully.']);
    });
    Route::get('/user', function (Request $request) {
        return $request->user();
    });
    Route::post('/profile/avatar', [AccountAvatarController::class, 'store'])->middleware('throttle:10,1');
    Route::delete('/profile/avatar', [AccountAvatarController::class, 'destroy'])->middleware('throttle:10,1');
    Route::get('/settings', [AccountSettingsController::class, 'index'])->middleware('throttle:30,1');
    Route::patch('/settings', [AccountSettingsController::class, 'update'])->middleware('throttle:30,1');
    Route::delete('/account', [AccountSettingsController::class, 'deleteAccount'])->middleware('throttle:5,1');
    Route::get('/passenger/wallet', [AccountSettingsController::class, 'wallet'])->middleware('throttle:30,1');
    Route::post('/passenger/wallet/topup', [AccountSettingsController::class, 'topUpWallet'])->middleware('throttle:10,1');
    Route::post('/passenger/support', [AccountSettingsController::class, 'submitSupport'])->middleware('throttle:10,1');
    Route::delete('/trips/history', [AccountSettingsController::class, 'deleteHistory'])->middleware('throttle:10,1');
    Route::post('/rider/selfie', [AccountSettingsController::class, 'uploadSelfie'])->middleware('throttle:10,1');
    Route::post('/rider/shift', [AccountSettingsController::class, 'updateShift'])->middleware('throttle:30,1');
    Route::patch('/rider/vehicle', [AccountSettingsController::class, 'updateVehicle'])->middleware('throttle:30,1');
    Route::get('/rider/incidents', [AccountSettingsController::class, 'incidentHistory'])->middleware('throttle:30,1');
    Route::get('/account/export', [AccountSettingsController::class, 'exportPersonalData'])->middleware('throttle:5,1');

    Route::prefix('admin')->middleware(['admin.role', 'throttle:30,1'])->group(function () {
        Route::get('/audit-logs', [AdminAuditLogController::class, 'index']);
        Route::get('/staff', [AdminStaffController::class, 'index']);
        Route::post('/staff', [AdminStaffController::class, 'store']);
        Route::patch('/staff/{staff}/role', [AdminStaffController::class, 'updateRole']);
        Route::patch('/staff/{staff}/active', [AdminStaffController::class, 'updateActive']);
        Route::get('/reports', [AdminReportController::class, 'show']);
        Route::get('/reports/export', [AdminReportController::class, 'export']);
        Route::get('/dashboard', [AdminDashboardController::class, 'index']);
        Route::get('/overview', [AdminDashboardController::class, 'overview']);
        Route::get('/rider-applications', [AdminDashboardController::class, 'pendingRiders']);
        Route::get('/recent-trips', [AdminDashboardController::class, 'recentTrips']);
        Route::get('/active-trips', [AdminDashboardController::class, 'activeTrips']);
        Route::get('/incidents', [AdminIncidentController::class, 'index']);
        Route::post('/incidents', [AdminIncidentController::class, 'store']);
        Route::patch('/incidents/{incident}/assignment', [AdminIncidentController::class, 'assign']);
        Route::post('/incidents/{incident}/notes', [AdminIncidentController::class, 'addNote']);
        Route::post('/incidents/{incident}/resolve', [AdminIncidentController::class, 'resolve']);
        Route::get('/users', [AdminDashboardController::class, 'users']);
        Route::post('/users', [AdminDashboardController::class, 'createUser']);
        Route::patch('/users/{account}/suspension', [AdminDashboardController::class, 'updateAccountSuspension']);
        Route::post('/riders/{rider}/review', [AdminDashboardController::class, 'review']);
    });

    // Trip Dispatch Routes
    Route::get('/trips/current', [TripController::class, 'current']);
    Route::get('/trips/history', [TripController::class, 'history']);
    Route::get('/passenger/saved-places', [SavedPlaceController::class, 'index']);
    Route::post('/passenger/saved-places', [SavedPlaceController::class, 'store']);
    Route::delete('/passenger/saved-places/{savedPlace}', [SavedPlaceController::class, 'destroy']);
    Route::get('/trips/{trip}/navigation', [TripController::class, 'navigation'])->middleware('throttle:10,1');
    Route::get('/trips/places', [TripController::class, 'places'])->middleware('throttle:20,1');
    Route::post('/trips/estimate', [TripController::class, 'estimate']);
    Route::post('/trips', [TripController::class, 'requestRide']);
    Route::post('/trips/{trip}/cancel', [TripController::class, 'cancel']);
    Route::post('/trips/{trip}/accept', [TripController::class, 'accept']);
    Route::post('/trips/{trip}/status', [TripController::class, 'updateStatus']);
    Route::post('/trips/{trip}/payment/collect', [TripController::class, 'collectCashPayment']);
    Route::post('/trips/{trip}/rating', [TripRatingController::class, 'store'])->middleware('throttle:10,1');
    Route::post('/trips/{trip}/incidents', [TripIncidentController::class, 'store'])->middleware('throttle:10,1');
    Route::post('/trips/{trip}/share', [TripController::class, 'createShare']);
    Route::delete('/trips/{trip}/share', [TripController::class, 'revokeShare']);

    // Rider Location & Status
    Route::post('/rider/status', [LocationController::class, 'updateStatus']);
    Route::get('/rider/summary', [TripController::class, 'riderSummary']);
    Route::get('/rider/incoming', [TripController::class, 'riderIncoming']);
    Route::put('/rider/device-token', [LocationController::class, 'updateDeviceToken']);

    // Throttle location updates
    Route::middleware(['throttle:30,1'])->group(function () {
        Route::post('/rider/location', [LocationController::class, 'updateLocation']);
    });

    // Profiles
    Route::post('/rider/profile', [RiderProfileController::class, 'store']);
    Route::get('/rider/profile', [RiderProfileController::class, 'show']);
    Route::get('/rider/ratings', [TripRatingController::class, 'summary']);
});

Route::get('/images/profiles/{filename}', [RiderProfileController::class, 'showImage'])
    ->name('profile.image');
