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
        'verification_status'
    ];

    protected function casts(): array
    {
        return [
            // Encrypt sensitive fields at rest
            'license_number' => 'encrypted',
            'ghana_card_number' => 'encrypted',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}