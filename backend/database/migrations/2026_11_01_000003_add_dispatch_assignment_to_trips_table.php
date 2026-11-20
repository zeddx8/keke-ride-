<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trips', function (Blueprint $table) {
            $table->unsignedBigInteger('dispatch_rider_id')->nullable()->after('rider_id');
            $table->timestamp('dispatch_expires_at')->nullable()->after('dispatch_rider_id');
            $table->index(['dispatch_rider_id', 'dispatch_expires_at'], 'trips_dispatch_assignment_index');
        });
    }

    public function down(): void
    {
        Schema::table('trips', function (Blueprint $table) {
            $table->dropIndex('trips_dispatch_assignment_index');
            $table->dropColumn(['dispatch_rider_id', 'dispatch_expires_at']);
        });
    }
};
