<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreRiderProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Handled by the controller via policy, but double check role
        return $this->user()->role === 'rider';
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'license_number' => 'required|string|max:255',
            'ghana_card_number' => 'required|string|max:255',
            'plate_number' => 'required|string|max:20',
            // Validate file content type via PHP finfo (mimetypes), not just extension. Limit to 5MB.
            'license_image' => 'required|file|mimetypes:image/jpeg,image/png,image/webp|max:5120',
            'ghana_card_image' => 'required|file|mimetypes:image/jpeg,image/png,image/webp|max:5120',
        ];
    }
}