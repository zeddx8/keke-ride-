<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('push_notifications_enabled')->default(true)->after('fcm_token_updated_at');
            $table->string('preferred_language', 10)->default('en')->after('push_notifications_enabled');
            $table->timestamp('ride_history_deleted_at')->nullable()->after('preferred_language');
            $table->timestamp('shift_started_at')->nullable()->after('ride_history_deleted_at');
            $table->unsignedInteger('shift_seconds_total')->default(0)->after('shift_started_at');
            $table->timestamp('shift_break_started_at')->nullable()->after('shift_seconds_total');
        });

        Schema::table('rider_profiles', function (Blueprint $table) {
            $table->string('selfie_image_path')->nullable()->after('ghana_card_image_path');
            $table->timestamp('selfie_uploaded_at')->nullable()->after('selfie_image_path');
        });
    }

    public function down(): void
    {
        Schema::table('rider_profiles', function (Blueprint $table) {
            $table->dropColumn(['selfie_image_path', 'selfie_uploaded_at']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'push_notifications_enabled',
                'preferred_language',
                'ride_history_deleted_at',
                'shift_started_at',
                'shift_seconds_total',
                'shift_break_started_at',
            ]);
        });
    }
};
