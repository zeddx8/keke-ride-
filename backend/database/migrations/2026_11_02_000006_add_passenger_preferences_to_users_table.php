<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('default_service_type', 20)->default('ride')->after('payment_method');
            $table->boolean('quiet_ride')->default(false)->after('default_service_type');
            $table->boolean('extra_luggage')->default(false)->after('quiet_ride');
            $table->string('receipt_channel', 20)->default('none')->after('extra_luggage');
            $table->boolean('automatic_rating_prompt')->default(true)->after('receipt_channel');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'default_service_type',
                'quiet_ride',
                'extra_luggage',
                'receipt_channel',
                'automatic_rating_prompt',
            ]);
        });
    }
};
