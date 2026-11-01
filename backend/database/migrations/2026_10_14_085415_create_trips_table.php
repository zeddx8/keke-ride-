<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('passenger_id')->constrained('users');
            $table->foreignId('rider_id')->nullable()->constrained('users');
            $table->geometry('pickup_point', subtype: 'point', srid: 4326);
            $table->string('landmark_note', 255)->nullable();
            $table->geometry('destination_point', subtype: 'point', srid: 4326);
            $table->decimal('estimated_distance_km', 8, 2);
            $table->decimal('estimated_fare', 8, 2);
            $table->enum('status', ['searching', 'accepted', 'arrived', 'started', 'completed', 'cancelled'])->default('searching');
            $table->enum('payment_method', ['cash'])->default('cash'); // Only cash for MVP
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trips');
    }
};