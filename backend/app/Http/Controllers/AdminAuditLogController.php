<?php

namespace App\Http\Controllers;

use App\Models\AdminAuditLog;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminAuditLogController extends Controller
{
    private const ACTIONS = [
        'account.created',
        'rider.approved',
        'rider.rejected',
        'incident.created',
        'incident.note_added',
        'incident.resolved',
        'incident.assigned',
        'admin.role_changed',
        'admin.invited',
        'admin.activated',
        'admin.deactivated',
        'account.suspended',
        'account.restored',
    ];

    public function index(Request $request)
    {
        if (! $request->user()->hasAdminPermission('audit.view')) {
            abort(403, 'Your administrator role does not allow this action.');
        }

        $validated = $request->validate([
            'action' => ['sometimes', 'nullable', Rule::in(self::ACTIONS)],
        ]);

        $query = AdminAuditLog::query()->latest('id');
        if (! empty($validated['action'])) {
            $query->where('action', $validated['action']);
        }

        $logs = $query->paginate(30);

        return response()->json([
            'data' => $logs->getCollection()->map(fn (AdminAuditLog $log) => [
                'id' => $log->id,
                'actor' => $log->actor_label,
                'action' => $log->action,
                'subject_type' => $log->subject_type,
                'subject_id' => $log->subject_id,
                'summary' => $log->summary,
                'created_at' => $log->created_at,
            ]),
            'current_page' => $logs->currentPage(),
            'last_page' => $logs->lastPage(),
            'total' => $logs->total(),
        ]);
    }
}
