<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('trusted_contact_name', 120)->nullable()->after('email');
            $table->string('trusted_contact_phone', 30)->nullable()->after('trusted_contact_name');
            $table->boolean('hide_exact_location')->default(false)->after('trusted_contact_phone');
            $table->boolean('emergency_alerts_enabled')->default(true)->after('hide_exact_location');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'trusted_contact_name',
                'trusted_contact_phone',
                'hide_exact_location',
                'emergency_alerts_enabled',
            ]);
        });
    }
};
