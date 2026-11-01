<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trip_incidents', function (Blueprint $table) {
            $table->string('reporter_message', 2000)->nullable()->after('summary');
        });
    }

    public function down(): void
    {
        Schema::table('trip_incidents', function (Blueprint $table) {
            $table->dropColumn('reporter_message');
        });
    }
};
