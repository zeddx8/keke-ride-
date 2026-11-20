<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RiderProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'license_number',
        'ghana_card_number',
        'plate_number',
        'license_image_path',
        'ghana_card_image_path',
        'selfie_image_path',
        'selfie_uploaded_at',
        'verification_status',
        'vehicle_make',
        'vehicle_model',
        'vehicle_color',
        'license_expiry',
        'insurance_expiry',
        'vehicle_papers_expiry',
        'roadworthy_expiry',
    ];

    protected function casts(): array
    {
        return [
            // Encrypt sensitive fields at rest
            'license_number' => 'encrypted',
            'ghana_card_number' => 'encrypted',
            'selfie_uploaded_at' => 'datetime',
            'license_expiry' => 'date',
            'insurance_expiry' => 'date',
            'vehicle_papers_expiry' => 'date',
            'roadworthy_expiry' => 'date',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}