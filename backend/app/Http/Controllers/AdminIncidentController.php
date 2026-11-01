<?php

namespace App\Http\Controllers;

use App\Models\AdminAuditLog;
use App\Models\TripIncident;
use App\Models\TripIncidentNote;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminIncidentController extends Controller
{
    private const RESPONSE_SLA_MINUTES = 240;

    public function index(Request $request)
    {
        $this->authorizeAdmin($request, 'incidents.view');

        $validated = $request->validate([
            'status' => ['sometimes', Rule::in(['all', 'open', 'resolved'])],
            'triage' => ['sometimes', Rule::in(['all', 'unassigned', 'overdue'])],
        ]);

        $query = TripIncident::query()
            ->with([
                'trip:id,status,pickup_location,landmark_note,destination_location,estimated_fare,created_at',
                'creator:id,name,phone',
                'resolver:id,name,phone',
                'assignee:id,name,phone,admin_role',
                'notes' => fn ($notes) => $notes
                    ->with('creator:id,name,phone')
                    ->latest()
                    ->limit(20),
            ])
            ->latest('updated_at');

        if (($validated['status'] ?? 'all') !== 'all') {
            $query->where('status', $validated['status']);
        }
        if (($validated['triage'] ?? 'all') === 'unassigned') {
            $query->whereNull('assigned_to')->where('status', 'open');
        } elseif (($validated['triage'] ?? 'all') === 'overdue') {
            $query->where('status', 'open')
                ->whereNull('first_response_at')
                ->where('created_at', '<=', now()->subMinutes(self::RESPONSE_SLA_MINUTES));
        }

        $incidents = $query->paginate(25);
        $assignees = User::query()
            ->where('role', 'admin')
            ->where('admin_active', true)
            ->where('is_suspended', false)
            ->whereIn('admin_role', ['operations', 'support'])
            ->orderBy('name')
            ->get(['id', 'name', 'phone', 'admin_role'])
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'phone' => $user->phone,
                'admin_role' => $user->admin_role,
            ]);

        return response()->json([
            'data' => $incidents->getCollection()->map(fn (TripIncident $incident) => $this->serializeIncident($incident)),
            'current_page' => $incidents->currentPage(),
            'last_page' => $incidents->lastPage(),
            'total' => $incidents->total(),
            'eligible_assignees' => $assignees,
            'response_sla_minutes' => self::RESPONSE_SLA_MINUTES,
        ]);
    }

    public function assign(Request $request, TripIncident $incident)
    {
        $this->authorizeAdmin($request, 'incidents.assign');
        $validated = $request->validate([
            'assignee_id' => ['present', 'nullable', 'integer', 'exists:users,id'],
        ]);

        DB::transaction(function () use ($request, $incident, $validated) {
            $lockedIncident = TripIncident::query()
                ->whereKey($incident->id)
                ->lockForUpdate()
                ->firstOrFail();
            abort_if($lockedIncident->status !== 'open', 409, 'Resolved incidents cannot be assigned.');
            abort_if(! $request->user()->fresh()->hasAdminPermission('incidents.assign'), 403, 'Your administrator role does not allow this action.');

            $assigneeId = $validated['assignee_id'];
            $assignee = null;
            if ($assigneeId !== null) {
                if ($lockedIncident->assigned_to === $assigneeId) {
                    return;
                }

                $assignee = User::query()
                    ->whereKey($assigneeId)
                    ->where('role', 'admin')
                    ->where('admin_active', true)
                    ->where('is_suspended', false)
                    ->whereIn('admin_role', ['operations', 'support'])
                    ->first();

                abort_if(! $assignee, 422, 'Incidents can only be assigned to active Operations or Support staff.');
            }

            if ($lockedIncident->assigned_to === $assigneeId) {
                return;
            }

            $previousAssigneeId = $lockedIncident->assigned_to;
            $lockedIncident->update([
                'assigned_to' => $assigneeId,
                'assigned_at' => $assigneeId === null ? null : now(),
            ]);

            AdminAuditLog::record(
                $request->user(),
                'incident.assigned',
                'trip_incident',
                $lockedIncident->id,
                $assignee
                    ? 'Assigned incident #'.$lockedIncident->id.' to admin #'.$assignee->id.'.'
                    : 'Unassigned incident #'.$lockedIncident->id.($previousAssigneeId ? ' from admin #'.$previousAssigneeId.'.' : '.'),
            );
        });

        return response()->json(['message' => 'Incident assignment updated.']);
    }

    public function store(Request $request)
    {
        $this->authorizeAdmin($request, 'incidents.create');

        $validated = $request->validate([
            'trip_id' => ['required', 'integer', 'exists:trips,id'],
            'category' => ['required', Rule::in(['safety', 'payment', 'conduct', 'lost_item', 'service', 'other'])],
            'summary' => 'required|string|max:160',
            'details' => 'required|string|max:2000',
        ]);

        $incident = DB::transaction(function () use ($request, $validated) {
            $incident = TripIncident::query()->create([
                'trip_id' => $validated['trip_id'],
                'created_by' => $request->user()->id,
                'category' => $validated['category'],
                'summary' => trim($validated['summary']),
                'status' => 'open',
                'first_response_at' => now(),
            ]);

            $incident->notes()->create([
                'created_by' => $request->user()->id,
                'body' => trim($validated['details']),
            ]);

            AdminAuditLog::record(
                $request->user(),
                'incident.created',
                'trip_incident',
                $incident->id,
                'Opened incident #'.$incident->id.' for trip #'.$incident->trip_id.'.',
            );

            return $incident;
        });

        return response()->json([
            'message' => 'Incident recorded and opened for follow-up.',
            'incident_id' => $incident->id,
        ], 201);
    }

    public function addNote(Request $request, TripIncident $incident)
    {
        $this->authorizeAdmin($request, 'incidents.note');
        abort_if($incident->status !== 'open', 409, 'Resolved incidents cannot receive new notes.');

        $validated = $request->validate([
            'body' => 'required|string|max:2000',
        ]);

        DB::transaction(function () use ($request, $incident, $validated) {
            $lockedIncident = TripIncident::query()
                ->whereKey($incident->id)
                ->lockForUpdate()
                ->firstOrFail();
            abort_if($lockedIncident->status !== 'open', 409, 'Resolved incidents cannot receive new notes.');

            $lockedIncident->notes()->create([
                'created_by' => $request->user()->id,
                'body' => trim($validated['body']),
            ]);
            $lockedIncident->first_response_at ??= now();
            $lockedIncident->save();
            $lockedIncident->touch();
            AdminAuditLog::record(
                $request->user(),
                'incident.note_added',
                'trip_incident',
                $incident->id,
                'Added a follow-up note to incident #'.$incident->id.'.',
            );
        });

        return response()->json(['message' => 'Follow-up note added.']);
    }

    public function resolve(Request $request, TripIncident $incident)
    {
        $this->authorizeAdmin($request, 'incidents.resolve');

        $validated = $request->validate([
            'resolution_note' => 'nullable|string|max:2000',
            'reporter_message' => 'nullable|string|max:2000',
        ]);

        DB::transaction(function () use ($request, $incident, $validated) {
            $lockedIncident = TripIncident::query()
                ->whereKey($incident->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_if($lockedIncident->status !== 'open', 409, 'This incident has already been resolved.');

            if (isset($validated['resolution_note']) && trim($validated['resolution_note']) !== '') {
                $lockedIncident->notes()->create([
                    'created_by' => $request->user()->id,
                    'body' => trim($validated['resolution_note']),
                ]);
            }

            $lockedIncident->first_response_at ??= now();
            $lockedIncident->update([
                'status' => 'resolved',
                'resolved_by' => $request->user()->id,
                'resolved_at' => now(),
                'reporter_message' => isset($validated['reporter_message']) && trim($validated['reporter_message']) !== ''
                    ? trim($validated['reporter_message'])
                    : null,
            ]);

            AdminAuditLog::record(
                $request->user(),
                'incident.resolved',
                'trip_incident',
                $lockedIncident->id,
                'Resolved incident #'.$lockedIncident->id.'.',
            );
        });

        return response()->json(['message' => 'Incident marked as resolved.']);
    }

    private function authorizeAdmin(Request $request, string $permission): void
    {
        if (! $request->user()->hasAdminPermission($permission)) {
            abort(403, 'Your administrator role does not allow this action.');
        }
    }

    private function serializeIncident(TripIncident $incident): array
    {
        return [
            'id' => $incident->id,
            'trip_id' => $incident->trip_id,
            'category' => $incident->category,
            'summary' => $incident->summary,
            'reporter_message' => $incident->reporter_message,
            'status' => $incident->status,
            'created_at' => $incident->created_at,
            'resolved_at' => $incident->resolved_at,
            'assigned_at' => $incident->assigned_at,
            'first_response_at' => $incident->first_response_at,
            'is_overdue' => $incident->status === 'open'
                && $incident->first_response_at === null
                && $incident->created_at->lte(now()->subMinutes(self::RESPONSE_SLA_MINUTES)),
            'assignee' => $incident->assignee ? [
                'id' => $incident->assignee->id,
                'name' => $incident->assignee->name,
                'phone' => $incident->assignee->phone,
                'admin_role' => $incident->assignee->admin_role,
            ] : null,
            'creator' => [
                'name' => $incident->creator?->name,
                'phone' => $incident->creator?->phone,
            ],
            'resolver' => $incident->resolver ? [
                'name' => $incident->resolver->name,
                'phone' => $incident->resolver->phone,
            ] : null,
            'trip' => $incident->trip ? [
                'status' => $incident->trip->status,
                'pickup_location' => $incident->trip->pickup_location,
                'landmark_note' => $incident->trip->landmark_note,
                'destination_location' => $incident->trip->destination_location,
                'estimated_fare' => (float) $incident->trip->estimated_fare,
                'created_at' => $incident->trip->created_at,
            ] : null,
            'notes' => $incident->notes
                ->sortBy('created_at')
                ->values()
                ->map(fn (TripIncidentNote $note) => [
                    'id' => $note->id,
                    'body' => $note->body,
                    'created_at' => $note->created_at,
                    'creator' => [
                        'name' => $note->creator?->name,
                        'phone' => $note->creator?->phone,
                    ],
                ]),
        ];
    }
}
