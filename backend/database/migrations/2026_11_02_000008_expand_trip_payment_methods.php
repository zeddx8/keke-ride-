<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE trips MODIFY payment_method ENUM('cash','wallet','mobile_money') NOT NULL DEFAULT 'cash'");
        } elseif (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_payment_method_check");
            DB::statement("ALTER TABLE trips ALTER COLUMN payment_method TYPE VARCHAR(20)");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE trips MODIFY payment_method ENUM('cash') NOT NULL DEFAULT 'cash'");
        }
    }
};
