<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdminAuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'admin_id',
        'actor_label',
        'action',
        'subject_type',
        'subject_id',
        'summary',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public static function record(
        User $admin,
        string $action,
        string $subjectType,
        ?int $subjectId,
        string $summary,
    ): self {
        return self::query()->create([
            'admin_id' => $admin->id,
            'actor_label' => $admin->name ?: 'Admin #'.$admin->id,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'summary' => $summary,
        ]);
    }
}
