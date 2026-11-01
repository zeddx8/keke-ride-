<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('name', 100)->nullable()->after('phone');
            $table->string('password')->nullable()->after('name');
            $table->timestamp('phone_verified_at')->nullable()->after('password');
            $table->string('otp_purpose', 32)->nullable()->after('otp_code');
        });

        DB::table('users')
            ->whereNull('phone_verified_at')
            ->whereNull('otp_code')
            ->update(['phone_verified_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['name', 'password', 'phone_verified_at', 'otp_purpose']);
        });
    }
};
