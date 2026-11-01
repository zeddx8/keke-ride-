import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import apiClient from '../../api/client';

type AuditAction =
  | 'account.created'
  | 'rider.approved'
  | 'rider.rejected'
  | 'incident.created'
  | 'incident.note_added'
  | 'incident.resolved'
  | 'incident.assigned'
  | 'admin.role_changed'
  | 'admin.invited'
  | 'admin.activated'
  | 'admin.deactivated';

interface AuditEntry {
  id: number;
  actor: string;
  action: AuditAction;
  subject_type: string;
  subject_id: number | null;
  summary: string;
  created_at: string;
}

interface AuditLogResponse {
  data: AuditEntry[];
  current_page: number;
  last_page: number;
  total: number;
}

const actionOptions: { value: AuditAction | 'all'; label: string }[] = [
  { value: 'all', label: 'All actions' },
  { value: 'account.created', label: 'Account created' },
  { value: 'rider.approved', label: 'Rider approved' },
  { value: 'rider.rejected', label: 'Rider rejected' },
  { value: 'incident.created', label: 'Incident opened' },
  { value: 'incident.note_added', label: 'Incident note added' },
  { value: 'incident.resolved', label: 'Incident resolved' },
  { value: 'incident.assigned', label: 'Incident assigned' },
  { value: 'admin.role_changed', label: 'Admin role changed' },
  { value: 'admin.invited', label: 'Admin invited' },
  { value: 'admin.activated', label: 'Admin reactivated' },
  { value: 'admin.deactivated', label: 'Admin deactivated' },
];

const actionLabel = (action: AuditAction) => (
  actionOptions.find((option) => option.value === action)?.label ?? action
);

const AuditLog = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState<AuditAction | 'all'>('all');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async (pageNumber: number, action: AuditAction | 'all', signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<AuditLogResponse>('/admin/audit-logs', {
        params: {
          page: pageNumber,
          action: action === 'all' ? undefined : action,
        },
        signal,
      });
      setLogs(data.data);
      setPage(data.current_page);
      setLastPage(data.last_page);
      setTotal(data.total);
    } catch (requestError: unknown) {
      if (signal?.aborted) return;
      setError(axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data?.message || 'Could not load the audit log.'
        : 'Could not load the audit log.');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const request = window.setTimeout(() => void loadLogs(1, filter, controller.signal), 0);
    return () => {
      window.clearTimeout(request);
      controller.abort();
    };
  }, [filter, loadLogs]);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-900/5 sm:p-6" aria-labelledby="audit-log-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="audit-log-title" className="text-lg font-bold tracking-tight">Admin audit log</h2>
          <p className="mt-1 text-sm text-slate-500">
            A read-only record of important admin actions. Sensitive notes and account credentials are excluded.
          </p>
        </div>
        <label className="text-sm font-semibold text-slate-700">
          Filter actions
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as AuditAction | 'all')}
            className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            {actionOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void loadLogs(page, filter)} className="mt-2 font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500" role="status">
          Loading audit entries…
        </p>
      ) : logs.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
          No admin actions have been recorded for this filter.
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {logs.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-slate-900">{actionLabel(entry.action)}</p>
                  <time className="shrink-0 text-xs text-slate-500">
                    {new Date(entry.created_at).toLocaleString()}
                  </time>
                </div>
                <p className="mt-2 text-sm text-slate-700">{entry.summary}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {entry.actor} · {entry.subject_type.replace('_', ' ')}{entry.subject_id ? ` #${entry.subject_id}` : ''}
                </p>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">Action</th>
                  <th className="pb-3 pr-4">Details</th>
                  <th className="pb-3 pr-4">Admin</th>
                  <th className="pb-3 pr-4">Affected record</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-slate-800">{actionLabel(entry.action)}</td>
                    <td className="max-w-sm py-3 pr-4 text-slate-700">{entry.summary}</td>
                    <td className="py-3 pr-4">{entry.actor}</td>
                    <td className="py-3 pr-4 capitalize">
                      {entry.subject_type.replace('_', ' ')}{entry.subject_id ? ` #${entry.subject_id}` : ''}
                    </td>
                    <td className="py-3 text-slate-600">{new Date(entry.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>{total.toLocaleString()} actions · Page {page} of {lastPage}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadLogs(page - 1, filter)}
                disabled={page <= 1 || isLoading}
                className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => void loadLogs(page + 1, filter)}
                disabled={page >= lastPage || isLoading}
                className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default AuditLog;
