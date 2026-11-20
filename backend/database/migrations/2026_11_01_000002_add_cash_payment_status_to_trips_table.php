<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trips', function (Blueprint $table) {
            $table->enum('payment_status', ['pending', 'collected'])->default('pending')->after('payment_method');
            $table->timestamp('payment_collected_at')->nullable()->after('payment_status');
        });

        DB::table('trips')
            ->where('status', 'cancelled')
            ->update(['payment_status' => 'pending']);
    }

    public function down(): void
    {
        Schema::table('trips', function (Blueprint $table) {
            $table->dropColumn(['payment_status', 'payment_collected_at']);
        });
    }
};
