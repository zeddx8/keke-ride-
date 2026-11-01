<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')
            ->whereNotNull('phone_verified_at')
            ->whereNotNull('otp_code')
            ->whereNull('otp_purpose')
            ->update(['phone_verified_at' => null]);
    }

    public function down(): void {}
};
