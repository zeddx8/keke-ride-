<?php

namespace App\Http\Controllers;

use App\Models\Trip;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TripIncidentController extends Controller
{
    public function store(Request $request, Trip $trip)
    {
        $user = $request->user();

        if (! in_array($user->role, ['passenger', 'rider'], true)) {
            abort(403, 'Only passengers and riders can report trip issues.');
        }

        $participantColumn = $user->role === 'passenger' ? 'passenger_id' : 'rider_id';
        abort_unless((int) $trip->{$participantColumn} === (int) $user->id, 404);

        $validated = $request->validate([
            'category' => ['required', Rule::in(['safety', 'payment', 'conduct', 'lost_item', 'service', 'other'])],
            'summary' => 'required|string|max:160',
            'details' => 'required|string|max:2000',
        ]);

        $incident = DB::transaction(function () use ($trip, $user, $validated) {
            $incident = $trip->incidents()->create([
                'created_by' => $user->id,
                'category' => $validated['category'],
                'summary' => trim($validated['summary']),
                'status' => 'open',
            ]);

            $incident->notes()->create([
                'created_by' => $user->id,
                'body' => trim($validated['details']),
            ]);

            return $incident;
        });

        return response()->json([
            'message' => 'Your report was received. Our team will follow up.',
            'incident_id' => $incident->id,
        ], 201);
    }
}
