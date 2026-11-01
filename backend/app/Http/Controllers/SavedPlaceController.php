<?php

namespace App\Http\Controllers;

use App\Models\SavedPlace;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SavedPlaceController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePassenger($request);

        return response()->json([
            'saved_places' => $request->user()->savedPlaces()
                ->orderBy('name')
                ->get(['id', 'name', 'label', 'latitude', 'longitude']),
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizePassenger($request);

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:60',
                Rule::unique('saved_places', 'name')->where('user_id', $request->user()->id),
            ],
            'label' => 'required|string|max:255',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
        ]);

        if ($request->user()->savedPlaces()->count() >= 10) {
            throw ValidationException::withMessages([
                'saved_places' => ['You can save up to 10 places. Remove one before adding another.'],
            ]);
        }

        $place = $request->user()->savedPlaces()->create($validated);

        return response()->json([
            'message' => 'Place saved.',
            'saved_place' => $place->only(['id', 'name', 'label', 'latitude', 'longitude']),
        ], 201);
    }

    public function destroy(Request $request, SavedPlace $savedPlace)
    {
        $this->authorizePassenger($request);

        if ((int) $savedPlace->user_id !== (int) $request->user()->id) {
            abort(404);
        }

        $savedPlace->delete();

        return response()->json(['message' => 'Saved place removed.']);
    }

    private function authorizePassenger(Request $request): void
    {
        if ($request->user()->role !== 'passenger') {
            abort(403, 'Only passengers can manage saved places.');
        }
    }
}
