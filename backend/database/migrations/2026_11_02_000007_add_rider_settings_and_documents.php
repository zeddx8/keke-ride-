<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedSmallInteger('rider_request_radius_km')->default(10);
            $table->boolean('destination_requests_enabled')->default(false);
            $table->string('preferred_areas', 500)->nullable();
            $table->string('navigation_app', 20)->default('google_maps');
            $table->boolean('break_reminders_enabled')->default(true);
            $table->boolean('alertness_prompts_enabled')->default(true);
            $table->string('earnings_summary_period', 10)->default('weekly');
            $table->string('withdrawal_account', 120)->nullable();
        });

        Schema::table('rider_profiles', function (Blueprint $table) {
            $table->string('vehicle_make', 80)->nullable();
            $table->string('vehicle_model', 80)->nullable();
            $table->string('vehicle_color', 40)->nullable();
            $table->date('license_expiry')->nullable();
            $table->date('insurance_expiry')->nullable();
            $table->date('vehicle_papers_expiry')->nullable();
            $table->date('roadworthy_expiry')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('rider_profiles', function (Blueprint $table) {
            $table->dropColumn([
                'vehicle_make', 'vehicle_model', 'vehicle_color',
                'license_expiry', 'insurance_expiry', 'vehicle_papers_expiry', 'roadworthy_expiry',
            ]);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'rider_request_radius_km', 'destination_requests_enabled', 'preferred_areas',
                'navigation_app', 'break_reminders_enabled', 'alertness_prompts_enabled',
                'earnings_summary_period', 'withdrawal_account',
            ]);
        });
    }
};
