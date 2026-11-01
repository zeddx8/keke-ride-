<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rider_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->string('name');
            $table->string('license_number'); // unique() removed for encryption compatibility
            $table->string('ghana_card_number'); // unique() removed for encryption compatibility
            $table->string('plate_number')->unique();
            $table->string('license_image_path')->nullable();
            $table->string('ghana_card_image_path')->nullable();
            $table->enum('verification_status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rider_profiles');
    }
};