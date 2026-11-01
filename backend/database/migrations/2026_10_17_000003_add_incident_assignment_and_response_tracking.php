<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trip_incidents', function (Blueprint $table) {
            $table->foreignId('assigned_to')->nullable()->after('resolved_by')->constrained('users')->nullOnDelete();
            $table->timestamp('assigned_at')->nullable()->after('resolved_at');
            $table->timestamp('first_response_at')->nullable()->after('assigned_at');
            $table->index(['status', 'assigned_to', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('trip_incidents', function (Blueprint $table) {
            $table->dropIndex(['status', 'assigned_to', 'created_at']);
            $table->dropConstrainedForeignId('assigned_to');
            $table->dropColumn(['assigned_at', 'first_response_at']);
        });
    }
};
