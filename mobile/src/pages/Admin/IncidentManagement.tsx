import { useCallback, useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import apiClient from '../../api/client';

type IncidentStatus = 'open' | 'resolved';
type IncidentFilter = 'all' | IncidentStatus;
type IncidentTriageFilter = 'all' | 'unassigned' | 'overdue';
type IncidentCategory = 'safety' | 'payment' | 'conduct' | 'lost_item' | 'service' | 'other';

interface IncidentPerson {
  id?: number;
  name: string | null;
  phone: string | null;
  admin_role?: 'super_admin' | 'operations' | 'support' | null;
}

interface IncidentAssignee {
  id: number;
  name: string | null;
  phone: string;
  admin_role: 'operations' | 'support';
}

interface IncidentNote {
  id: number;
  body: string;
  created_at: string;
  creator: IncidentPerson;
}

interface TripIncident {
  id: number;
  trip_id: number;
  category: IncidentCategory;
  summary: string;
  reporter_message: string | null;
  status: IncidentStatus;
  created_at: string;
  resolved_at: string | null;
  assigned_at: string | null;
  first_response_at: string | null;
  is_overdue: boolean;
  assignee: IncidentPerson | null;
  creator: IncidentPerson;
  resolver: IncidentPerson | null;
  trip: {
    status: string;
    pickup_location: string | null;
    landmark_note: string | null;
    destination_location: string | null;
    estimated_fare: number;
    created_at: string;
  } | null;
  notes: IncidentNote[];
}

interface IncidentManagementProps {
  reportTripId: number | null;
  onReportHandled: () => void;
  canCreateIncidents: boolean;
  canAddNotes: boolean;
  canResolveIncidents: boolean;
}

const categories: IncidentCategory[] = ['safety', 'payment', 'conduct', 'lost_item', 'service', 'other'];
const filters: IncidentFilter[] = ['all', 'open', 'resolved'];

const requestError = (error: unknown, fallback: string) => (
  axios.isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(error)
    ? Object.values(error.response?.data?.errors ?? {}).flat()[0]
      || error.response?.data?.message
      || fallback
    : fallback
);

const IncidentManagement = ({
  reportTripId,
  onReportHandled,
  canCreateIncidents,
  canAddNotes,
  canResolveIncidents,
}: IncidentManagementProps) => {
  const [incidents, setIncidents] = useState<TripIncident[]>([]);
  const [eligibleAssignees, setEligibleAssignees] = useState<IncidentAssignee[]>([]);
  const [assigneeDrafts, setAssigneeDrafts] = useState<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = useState<IncidentFilter>('open');
  const [triageFilter, setTriageFilter] = useState<IncidentTriageFilter>('all');
  const [responseSlaMinutes, setResponseSlaMinutes] = useState(240);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tripId, setTripId] = useState('');
  const [category, setCategory] = useState<IncidentCategory>('safety');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [reporterMessageDrafts, setReporterMessageDrafts] = useState<Record<number, string>>({});
  const [busyIncidentId, setBusyIncidentId] = useState<number | null>(null);

  const loadIncidents = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const { data } = await apiClient.get<{
        data: TripIncident[];
        eligible_assignees: IncidentAssignee[];
        response_sla_minutes: number;
      }>('/admin/incidents', {
        params: { status: statusFilter, triage: triageFilter },
        signal,
      });
      setIncidents(data.data);
      setEligibleAssignees(data.eligible_assignees);
      setResponseSlaMinutes(data.response_sla_minutes);
      setAssigneeDrafts(Object.fromEntries(data.data.map((incident) => [
        incident.id,
        incident.assignee?.id ? String(incident.assignee.id) : '',
      ])));
    } catch (loadError: unknown) {
      if (!signal?.aborted) setError(requestError(loadError, 'Could not load incidents.'));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [statusFilter, triageFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadIncidents(controller.signal);
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadIncidents]);

  const openReportForm = (prefillTripId?: number) => {
    setError(null);
    setMessage(null);
    if (prefillTripId !== undefined) setTripId(String(prefillTripId));
    setShowForm(true);
  };

  const closeReportForm = () => {
    setShowForm(false);
    setTripId('');
    onReportHandled();
  };

  const createIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.post('/admin/incidents', {
        trip_id: Number(tripId),
        category,
        summary: summary.trim(),
        details: details.trim(),
      });
      setMessage('Incident opened. Follow-up notes and resolution are recorded in its timeline.');
      setSummary('');
      setDetails('');
      closeReportForm();
      await loadIncidents();
    } catch (createError: unknown) {
      setError(requestError(createError, 'Could not create this incident.'));
    } finally {
      setIsCreating(false);
    }
  };

  const addNote = async (event: FormEvent<HTMLFormElement>, incidentId: number) => {
    event.preventDefault();
    const body = noteDrafts[incidentId]?.trim();
    if (!body) return;
    setBusyIncidentId(incidentId);
    setError(null);
    try {
      await apiClient.post(`/admin/incidents/${incidentId}/notes`, { body });
      setNoteDrafts((current) => ({ ...current, [incidentId]: '' }));
      await loadIncidents();
    } catch (noteError: unknown) {
      setError(requestError(noteError, 'Could not add the follow-up note.'));
    } finally {
      setBusyIncidentId(null);
    }
  };

  const assignIncident = async (incident: TripIncident) => {
    const assigneeValue = assigneeDrafts[incident.id] ?? '';
    const assigneeId = assigneeValue === '' ? null : Number(assigneeValue);
    if ((incident.assignee?.id ?? null) === assigneeId) return;
    setBusyIncidentId(incident.id);
    setError(null);
    setMessage(null);
    try {
      await apiClient.patch(`/admin/incidents/${incident.id}/assignment`, { assignee_id: assigneeId });
      setMessage(`Incident #${incident.id} assignment updated.`);
      await loadIncidents();
    } catch (assignmentError: unknown) {
      setError(requestError(assignmentError, 'Could not update incident assignment.'));
    } finally {
      setBusyIncidentId(null);
    }
  };

  const resolveIncident = async (incident: TripIncident) => {
    if (!window.confirm(`Mark incident #${incident.id} as resolved? This will close follow-up notes.`)) return;
    setBusyIncidentId(incident.id);
    setError(null);
    try {
      const reporterMessage = reporterMessageDrafts[incident.id]?.trim();
      await apiClient.post(`/admin/incidents/${incident.id}/resolve`, {
        reporter_message: reporterMessage || null,
      });
      setReporterMessageDrafts((current) => ({ ...current, [incident.id]: '' }));
      setMessage(`Incident #${incident.id} resolved${reporterMessage ? ' and reporter notified' : ''}.`);
      await loadIncidents();
    } catch (resolveError: unknown) {
      setError(requestError(resolveError, 'Could not resolve this incident.'));
    } finally {
      setBusyIncidentId(null);
    }
  };

  return (
    <section className="incident-panel rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-900/5 sm:p-6" aria-labelledby="incident-title">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="incident-title" className="text-lg font-bold tracking-tight">Incident follow-up</h2>
            <span className="incident-open-count rounded-full px-2.5 py-1 text-xs font-bold">
              {incidents.filter((incident) => incident.status === 'open').length} open
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Assign an owner, respond within {Math.round(responseSlaMinutes / 60)} hours, and track resolution.
          </p>
        </div>
        {canCreateIncidents && <button
          type="button"
          onClick={() => (showForm || reportTripId !== null ? closeReportForm() : openReportForm())}
          className="incident-create-button rounded-xl px-3 py-2 text-sm font-semibold transition"
        >
          {showForm || reportTripId !== null ? 'Close form' : 'Record incident'}
        </button>}
      </div>

      {(error || message) && (
        <div className={`mb-4 rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-800'}`} role={error ? 'alert' : 'status'}>
          {error || message}
          {error && (
            <button type="button" onClick={() => void loadIncidents()} className="ml-2 font-semibold underline">
              Retry
            </button>
          )}
        </div>
      )}

      {canCreateIncidents && (showForm || reportTripId !== null) && (
        <form onSubmit={createIncident} className="incident-form mb-5 grid gap-3 rounded-xl p-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Trip ID
            <input
              type="number"
              min={1}
              required
              value={reportTripId ?? tripId}
              onChange={(event) => {
                setTripId(event.target.value);
                if (reportTripId !== null) onReportHandled();
              }}
              placeholder="Enter the trip ID"
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as IncidentCategory)}
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2"
            >
              {categories.map((item) => (
                <option key={item} value={item}>{item.replace('_', ' ')}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Short summary
            <input
              required
              maxLength={160}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Briefly describe the issue"
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Initial note
            <textarea
              required
              maxLength={2000}
              rows={3}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Record what happened and any immediate action taken"
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2"
            />
          </label>
          <div className="flex justify-end gap-2 md:col-span-2">
            <button type="button" onClick={closeReportForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={isCreating} className="incident-create-button rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {isCreating ? 'Recording…' : 'Open incident'}
            </button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter incidents">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={filter === statusFilter}
            onClick={() => {
              setStatusFilter(filter);
              if (filter !== 'open') setTriageFilter('all');
            }}
            className={`incident-filter rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${filter === statusFilter ? 'is-selected' : ''}`}
          >
            {filter === 'all' ? 'All incidents' : filter}
          </button>
        ))}
        <span className="mx-1 hidden border-l border-slate-200 sm:inline-block" aria-hidden="true" />
        {([
          ['all', 'All open'],
          ['unassigned', 'Unassigned'],
          ['overdue', 'Overdue'],
        ] as const).map(([filter, label]) => (
          <button
            key={filter}
            type="button"
            aria-pressed={filter === triageFilter}
            onClick={() => {
              setTriageFilter(filter);
              if (filter !== 'all' && statusFilter !== 'open') setStatusFilter('open');
            }}
            className={`incident-filter rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === triageFilter ? 'is-selected' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && incidents.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500" role="status">Loading incidents…</p>
      ) : incidents.length === 0 ? (
        <p className="incident-empty rounded-xl p-6 text-center text-sm">
          {triageFilter === 'overdue'
            ? 'No open incidents have missed the first-response target.'
            : triageFilter === 'unassigned'
              ? 'All open incidents are assigned.'
              : statusFilter === 'resolved' ? 'No resolved incidents yet.' : 'No incidents to follow up.'}
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {incidents.map((incident) => (
            <article key={incident.id} className="incident-card rounded-2xl border p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Trip #{incident.trip_id} · {incident.category.replace('_', ' ')}
                  </p>
                  <h3 className="mt-1 font-bold">{incident.summary}</h3>
                </div>
                <span className={`incident-status rounded-full px-3 py-1 text-xs font-bold ${incident.status === 'resolved' ? 'is-resolved' : ''}`}>
                  {incident.status}
                </span>
              </div>
              {incident.status === 'open' && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${incident.is_overdue ? 'bg-red-100 text-red-800' : incident.first_response_at ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {incident.is_overdue
                      ? 'Overdue · no first response'
                      : incident.first_response_at
                        ? `First response ${new Date(incident.first_response_at).toLocaleString()}`
                        : `Response due within ${Math.round(responseSlaMinutes / 60)} hours`}
                  </span>
                  <span className="text-xs text-slate-500">
                    {incident.assignee
                      ? `Assigned to ${incident.assignee.name || incident.assignee.phone}`
                      : 'Unassigned'}
                  </span>
                </div>
              )}

              <div className="incident-trip-context mb-4 rounded-xl p-3 text-sm">
                <p className="font-semibold">
                  {incident.trip?.pickup_location || incident.trip?.landmark_note || 'Pickup'} → {incident.trip?.destination_location || 'Destination'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Trip status: {incident.trip?.status || 'unavailable'} · ₵{Number(incident.trip?.estimated_fare ?? 0).toFixed(2)}
                </p>
              </div>

              {incident.status === 'open' && (
                <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className="min-w-52 flex-1 text-xs font-semibold text-slate-600" htmlFor={`incident-assignee-${incident.id}`}>
                    Assign to active Support or Operations staff
                    <select
                      id={`incident-assignee-${incident.id}`}
                      value={assigneeDrafts[incident.id] ?? ''}
                      disabled={busyIncidentId !== null}
                      onChange={(event) => setAssigneeDrafts((current) => ({
                        ...current,
                        [incident.id]: event.target.value,
                      }))}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">Unassigned</option>
                      {eligibleAssignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.name || assignee.phone} · {assignee.admin_role}
                        </option>
                      ))}
                      {incident.assignee?.id
                        && !eligibleAssignees.some((assignee) => assignee.id === incident.assignee?.id)
                        && <option value={incident.assignee.id}>{incident.assignee.name || incident.assignee.phone} · no longer eligible</option>}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busyIncidentId !== null || (incident.assignee?.id ?? null) === ((assigneeDrafts[incident.id] ?? '') === '' ? null : Number(assigneeDrafts[incident.id]))}
                    onClick={() => void assignIncident(incident)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50"
                  >
                    {busyIncidentId === incident.id ? 'Saving…' : incident.assignee ? 'Save assignment' : 'Assign incident'}
                  </button>
                </div>
              )}

              <div className="incident-timeline space-y-3" aria-label={`Notes for incident ${incident.id}`}>
                {incident.notes.map((note) => (
                  <div key={note.id} className="incident-note border-l-2 pl-3">
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {note.creator.name || note.creator.phone || 'Admin'} · {new Date(note.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
                {incident.status === 'resolved' && incident.resolved_at && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-green-800">
                      Resolved by {incident.resolver?.name || incident.resolver?.phone || 'admin'} · {new Date(incident.resolved_at).toLocaleString()}
                    </p>
                    {incident.reporter_message && (
                      <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                        Shared with reporter: {incident.reporter_message}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {incident.status === 'open' && (canAddNotes || canResolveIncidents) && (
                <>
                  <form onSubmit={(event) => void addNote(event, incident.id)} className="mt-4 space-y-2">
                    {canAddNotes && <label className="sr-only" htmlFor={`incident-note-${incident.id}`}>Add follow-up note</label>}
                    {canAddNotes && <textarea
                      id={`incident-note-${incident.id}`}
                      maxLength={2000}
                      rows={2}
                      value={noteDrafts[incident.id] || ''}
                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [incident.id]: event.target.value }))}
                      placeholder="Add a follow-up note"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />}
                    {canResolveIncidents && <>
                    <label className="block text-xs font-semibold text-slate-600" htmlFor={`incident-reporter-message-${incident.id}`}>
                      Optional message shared with the reporter on resolution
                    </label>
                    <textarea
                      id={`incident-reporter-message-${incident.id}`}
                      maxLength={2000}
                      rows={2}
                      value={reporterMessageDrafts[incident.id] || ''}
                      onChange={(event) => setReporterMessageDrafts((current) => ({
                        ...current,
                        [incident.id]: event.target.value,
                      }))}
                      placeholder="Leave blank to resolve without a message"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    </>}
                    <div className="flex flex-wrap justify-end gap-2">
                      {canAddNotes && <button
                        type="submit"
                        disabled={!noteDrafts[incident.id]?.trim() || busyIncidentId !== null}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        Add note
                      </button>}
                      {canResolveIncidents && <button
                        type="button"
                        onClick={() => void resolveIncident(incident)}
                        disabled={busyIncidentId !== null}
                        className="incident-resolve-button rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        {busyIncidentId === incident.id ? 'Saving…' : 'Resolve incident'}
                      </button>}
                    </div>
                  </form>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default IncidentManagement;
