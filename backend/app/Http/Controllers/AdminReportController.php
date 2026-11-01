<?php

namespace App\Http\Controllers;

use App\Models\Trip;
use App\Models\TripIncident;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminReportController extends Controller
{
    public function show(Request $request)
    {
        $this->authorizeReports($request);
        [$start, $end] = $this->dateRange($request);

        return response()->json($this->report($start, $end));
    }

    public function export(Request $request): StreamedResponse
    {
        $this->authorizeReports($request);
        [$start, $end] = $this->dateRange($request);
        $report = $this->report($start, $end);
        $filename = 'keke-ride-report-'.$start->format('Y-m-d').'-'.$end->format('Y-m-d').'.csv';

        return response()->streamDownload(function () use ($report) {
            $stream = fopen('php://output', 'w');
            if ($stream === false) {
                throw new \RuntimeException('Unable to open CSV output stream.');
            }

            fputcsv($stream, ['Section', 'Metric', 'Value']);
            fputcsv($stream, ['Report', 'Start date', $report['start_date']]);
            fputcsv($stream, ['Report', 'End date', $report['end_date']]);
            fputcsv($stream, ['Trips', 'Total trips', $report['trips']['total']]);
            fputcsv($stream, ['Trips', 'Completed trips', $report['trips']['completed']]);
            fputcsv($stream, ['Trips', 'Cancelled trips', $report['trips']['cancelled']]);
            fputcsv($stream, ['Trips', 'Completion rate (%)', $report['trips']['completion_rate']]);
            fputcsv($stream, ['Trips', 'Estimated completed fares (GHS)', $report['trips']['estimated_completed_fares']]);
            foreach ($report['trips']['by_status'] as $status => $count) {
                fputcsv($stream, ['Trips by status', $status, $count]);
            }
            foreach ($report['rider_activity'] as $rider) {
                fputcsv($stream, [
                    'Rider activity',
                    'Rider #'.$rider['rider_id'].' trips / completed / estimated fares',
                    $rider['trips'].' / '.$rider['completed_trips'].' / '.$rider['estimated_completed_fares'],
                ]);
            }
            fputcsv($stream, ['Incidents', 'Total incidents', $report['incidents']['total']]);
            fputcsv($stream, ['Incidents', 'Open incidents', $report['incidents']['open']]);
            fputcsv($stream, ['Incidents', 'Resolved incidents', $report['incidents']['resolved']]);
            fputcsv($stream, ['Incidents', 'Unassigned open incidents', $report['incidents']['unassigned_open']]);
            fputcsv($stream, ['Incidents', 'Overdue open incidents', $report['incidents']['overdue_open']]);
            fputcsv($stream, ['Incidents', 'Average first response time (minutes)', $report['incidents']['average_first_response_minutes'] ?? '']);
            fputcsv($stream, ['Incidents', 'Average resolution time (minutes)', $report['incidents']['average_resolution_minutes'] ?? '']);
            foreach ($report['incidents']['by_category'] as $category => $count) {
                fputcsv($stream, ['Incidents by category', $category, $count]);
            }

            fclose($stream);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function dateRange(Request $request): array
    {
        $today = CarbonImmutable::today();
        $request->merge([
            'start_date' => $request->input('start_date', $today->subDays(29)->toDateString()),
            'end_date' => $request->input('end_date', $today->toDateString()),
        ]);

        $validated = $request->validate([
            'start_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:end_date'],
            'end_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:start_date'],
        ]);
        $start = CarbonImmutable::createFromFormat('Y-m-d', $validated['start_date'])->startOfDay();
        $end = CarbonImmutable::createFromFormat('Y-m-d', $validated['end_date'])->endOfDay();

        if ($start->diffInDays($end) > 365) {
            throw ValidationException::withMessages([
                'end_date' => ['The report date range cannot exceed 366 days.'],
            ]);
        }

        return [$start, $end];
    }

    private function report(CarbonImmutable $start, CarbonImmutable $end): array
    {
        $tripQuery = Trip::query()->whereBetween('created_at', [$start, $end]);
        $tripTotal = (clone $tripQuery)->count();
        $tripStatuses = (clone $tripQuery)
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status')
            ->map(fn ($count) => (int) $count)
            ->all();
        $completedTrips = $tripStatuses['completed'] ?? 0;
        $estimatedCompletedFares = (clone $tripQuery)
            ->where('status', 'completed')
            ->sum('estimated_fare');
        $riderActivity = (clone $tripQuery)
            ->whereNotNull('rider_id')
            ->select('rider_id')
            ->selectRaw('COUNT(*) as trips')
            ->selectRaw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_trips")
            ->selectRaw("SUM(CASE WHEN status = 'completed' THEN estimated_fare ELSE 0 END) as estimated_completed_fares")
            ->groupBy('rider_id')
            ->orderByDesc('trips')
            ->limit(50)
            ->get()
            ->map(fn ($rider) => [
                'rider_id' => (int) $rider->rider_id,
                'trips' => (int) $rider->trips,
                'completed_trips' => (int) $rider->completed_trips,
                'estimated_completed_fares' => round((float) $rider->estimated_completed_fares, 2),
            ])
            ->values();

        $incidentQuery = TripIncident::query()->whereBetween('created_at', [$start, $end]);
        $incidentStatuses = (clone $incidentQuery)
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');
        $incidentTotal = (clone $incidentQuery)->count();
        $resolvedIncidents = (int) ($incidentStatuses['resolved'] ?? 0);
        $unassignedOpenIncidents = (clone $incidentQuery)
            ->where('status', 'open')
            ->whereNull('assigned_to')
            ->count();
        $overdueOpenIncidents = (clone $incidentQuery)
            ->where('status', 'open')
            ->whereNull('first_response_at')
            ->where('created_at', '<=', now()->subHours(4))
            ->count();
        $averageFirstResponseSeconds = (clone $incidentQuery)
            ->whereNotNull('first_response_at')
            ->selectRaw('AVG(TIMESTAMPDIFF(SECOND, created_at, first_response_at)) as average_seconds')
            ->value('average_seconds');
        $averageResolutionSeconds = (clone $incidentQuery)
            ->where('status', 'resolved')
            ->whereNotNull('resolved_at')
            ->selectRaw('AVG(TIMESTAMPDIFF(SECOND, created_at, resolved_at)) as average_seconds')
            ->value('average_seconds');
        $incidentCategories = (clone $incidentQuery)
            ->select('category', DB::raw('COUNT(*) as total'))
            ->groupBy('category')
            ->pluck('total', 'category')
            ->map(fn ($count) => (int) $count)
            ->all();

        return [
            'start_date' => $start->toDateString(),
            'end_date' => $end->toDateString(),
            'trips' => [
                'total' => $tripTotal,
                'completed' => $completedTrips,
                'cancelled' => $tripStatuses['cancelled'] ?? 0,
                'completion_rate' => $tripTotal > 0 ? round(($completedTrips / $tripTotal) * 100, 1) : 0.0,
                'estimated_completed_fares' => round((float) $estimatedCompletedFares, 2),
                'by_status' => $tripStatuses,
            ],
            'rider_activity' => $riderActivity,
            'incidents' => [
                'total' => $incidentTotal,
                'open' => (int) ($incidentStatuses['open'] ?? 0),
                'resolved' => $resolvedIncidents,
                'unassigned_open' => $unassignedOpenIncidents,
                'overdue_open' => $overdueOpenIncidents,
                'average_first_response_minutes' => $averageFirstResponseSeconds === null
                    ? null
                    : round(((float) $averageFirstResponseSeconds) / 60, 1),
                'average_resolution_minutes' => $averageResolutionSeconds === null
                    ? null
                    : round(((float) $averageResolutionSeconds) / 60, 1),
                'by_category' => $incidentCategories,
            ],
        ];
    }

    private function authorizeReports(Request $request): void
    {
        if (! $request->user()->hasAdminPermission('reports.view')) {
            abort(403, 'Your administrator role does not allow access to reports.');
        }
    }
}
