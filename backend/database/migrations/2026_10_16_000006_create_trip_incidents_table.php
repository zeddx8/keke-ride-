<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trip_incidents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('trip_id')->constrained();
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('category', 32);
            $table->string('summary', 160);
            $table->string('status', 16)->default('open');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'updated_at']);
        });

        Schema::create('trip_incident_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('trip_incident_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->text('body');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trip_incident_notes');
        Schema::dropIfExists('trip_incidents');
    }
};
