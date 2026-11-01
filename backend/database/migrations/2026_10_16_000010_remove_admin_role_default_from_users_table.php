<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')
            ->where('role', '!=', 'admin')
            ->update(['admin_role' => null]);

        Schema::table('users', function (Blueprint $table) {
            $table->string('admin_role', 32)->nullable()->default(null)->change();
        });
    }

    public function down(): void
    {
        DB::table('users')
            ->where('role', '!=', 'admin')
            ->update(['admin_role' => 'support']);

        Schema::table('users', function (Blueprint $table) {
            $table->string('admin_role', 32)->nullable()->default('support')->change();
        });
    }
};
