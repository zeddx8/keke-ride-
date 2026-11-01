import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import apiClient from '../../api/client';

interface OperationsReport {
  start_date: string;
  end_date: string;
  trips: {
    total: number;
    completed: number;
    cancelled: number;
    completion_rate: number;
    estimated_completed_fares: number;
    by_status: Record<string, number>;
  };
  rider_activity: {
    rider_id: number;
    trips: number;
    completed_trips: number;
    estimated_completed_fares: number;
  }[];
  incidents: {
    total: number;
    open: number;
    resolved: number;
    unassigned_open: number;
    overdue_open: number;
    average_first_response_minutes: number | null;
    average_resolution_minutes: number | null;
    by_category: Record<string, number>;
  };
}

const localDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultStartDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return localDateString(date);
};

const requestError = (error: unknown, fallback: string) => (
  axios.isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(error)
    ? Object.values(error.response?.data?.errors ?? {}).flat()[0]
      || error.response?.data?.message
      || fallback
    : fallback
);

const Reports = () => {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(() => localDateString(new Date()));
  const [report, setReport] = useState<OperationsReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<OperationsReport>('/admin/reports', {
        params: { start_date: startDate, end_date: endDate },
        signal,
      });
      setReport(data);
    } catch (requestError: unknown) {
      if (!signal?.aborted) setError(requestErrorMessage(requestError, 'Could not load operational reports.'));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    const controller = new AbortController();
    const request = window.setTimeout(() => void loadReport(controller.signal), 0);
    return () => {
      window.clearTimeout(request);
      controller.abort();
    };
  }, [loadReport]);

  const exportCsv = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const { data } = await apiClient.get<Blob>('/admin/reports/export', {
        params: { start_date: startDate, end_date: endDate },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `keke-ride-report-${startDate}-${endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError: unknown) {
      setError(requestErrorMessage(exportError, 'Could not export this report.'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-900/5 sm:p-6" aria-labelledby="operations-reports-title">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="operations-reports-title" className="text-lg font-bold tracking-tight">Operational reports</h2>
          <p className="mt-1 text-sm text-slate-500">Trip performance, rider activity, and incident follow-up for the selected period.</p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={!report || isLoading || isExporting}
          className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
        >
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-4">
        <label className="text-sm font-semibold text-slate-700">
          From
          <input
            type="date"
            required
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          To
          <input
            type="date"
            required
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2"
          />
        </label>
        <p className="pb-2 text-xs text-slate-500" aria-live="polite">{isLoading ? 'Updating report…' : 'Report updates when dates change.'}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void loadReport()} className="mt-2 font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {!report && isLoading ? (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500" role="status">Loading operational reports…</p>
      ) : report ? (
        <>
          <p className="mb-4 text-xs text-slate-500">
            {report.start_date} – {report.end_date}. Fare totals are estimates, not reconciled payments.
          </p>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Trips', value: report.trips.total.toLocaleString() },
              { label: 'Completed', value: report.trips.completed.toLocaleString() },
              { label: 'Completion rate', value: `${report.trips.completion_rate}%` },
              { label: 'Estimated completed fares', value: `₵${report.trips.estimated_completed_fares.toFixed(2)}` },
              { label: 'Incidents', value: report.incidents.total.toLocaleString() },
              { label: 'Open incidents', value: report.incidents.open.toLocaleString() },
              { label: 'Resolved incidents', value: report.incidents.resolved.toLocaleString() },
              { label: 'Unassigned open incidents', value: report.incidents.unassigned_open.toLocaleString() },
              { label: 'Overdue first responses', value: report.incidents.overdue_open.toLocaleString() },
              {
                label: 'Avg. first response',
                value: report.incidents.average_first_response_minutes === null
                  ? '—'
                  : `${report.incidents.average_first_response_minutes} min`,
              },
              {
                label: 'Avg. resolution time',
                value: report.incidents.average_resolution_minutes === null
                  ? '—'
                  : `${report.incidents.average_resolution_minutes} min`,
              },
            ].map((metric) => (
              <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{metric.value}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section aria-labelledby="report-trip-status">
              <h3 id="report-trip-status" className="mb-2 font-bold text-slate-900">Trips by status</h3>
              {Object.keys(report.trips.by_status).length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                      <tr><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Trips</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(report.trips.by_status).map(([status, count]) => (
                        <tr key={status} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 capitalize">{status.replace('_', ' ')}</td>
                          <td className="px-3 py-2 text-right font-semibold">{count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No trips in this period.</p>}
            </section>

            <section aria-labelledby="report-incident-categories">
              <h3 id="report-incident-categories" className="mb-2 font-bold text-slate-900">Incidents by category</h3>
              {Object.keys(report.incidents.by_category).length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                      <tr><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Reports</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(report.incidents.by_category).map(([category, count]) => (
                        <tr key={category} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 capitalize">{category.replace('_', ' ')}</td>
                          <td className="px-3 py-2 text-right font-semibold">{count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No incidents in this period.</p>}
            </section>

            <section className="lg:col-span-2" aria-labelledby="report-rider-activity">
              <h3 id="report-rider-activity" className="mb-2 font-bold text-slate-900">Rider activity</h3>
              {report.rider_activity.length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Rider account</th>
                        <th className="px-3 py-2 text-right">Trips</th>
                        <th className="px-3 py-2 text-right">Completed</th>
                        <th className="px-3 py-2 text-right">Estimated completed fares</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rider_activity.map((rider) => (
                        <tr key={rider.rider_id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2">Rider #{rider.rider_id}</td>
                          <td className="px-3 py-2 text-right">{rider.trips.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{rider.completed_trips.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">₵{rider.estimated_completed_fares.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No rider-assigned trips in this period.</p>}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
};

const requestErrorMessage = requestError;

export default Reports;
