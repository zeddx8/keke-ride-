import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import ReportTripIssue from './ReportTripIssue';

interface TripRating {
  rating: number;
  comment: string | null;
}

interface TripIncidentStatus {
  id: number;
  category: string;
  summary: string;
  status: 'open' | 'resolved';
  reporter_message: string | null;
  resolved_at: string | null;
}

interface TripHistoryItem {
  id: number;
  rider_id: number | null;
  status: 'searching' | 'accepted' | 'arrived' | 'started' | 'completed' | 'cancelled';
  pickup_location: string | null;
  destination_location: string | null;
  pickup_lat: number | string;
  pickup_lng: number | string;
  destination_lat: number | string;
  destination_lng: number | string;
  estimated_distance_km: number | string;
  estimated_fare: number | string;
  payment_method: string;
  created_at: string;
  rating: TripRating | null;
  incidents: TripIncidentStatus[];
}

interface TripHistoryResponse {
  data: TripHistoryItem[];
  current_page: number;
  last_page: number;
}

const formatLocation = (label: string | null, lat: number | string, lng: number | string) => (
  label || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`
);

const TripHistory = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TripHistoryItem[]>([]);
  const [page, setPage] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [ratingDrafts, setRatingDrafts] = useState<Record<number, number>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [ratingErrors, setRatingErrors] = useState<Record<number, string>>({});
  const [submittingRating, setSubmittingRating] = useState<number | null>(null);
  const [statusUpdateMessage, setStatusUpdateMessage] = useState<string | null>(null);
  const incidentStatuses = useRef<Record<number, TripIncidentStatus['status']>>({});
  const historyRequestInFlight = useRef(false);

  const loadHistory = async (pageNumber: number, replace: boolean, notifyStatusChanges = false) => {
    if (historyRequestInFlight.current) return;
    historyRequestInFlight.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<TripHistoryResponse>('/trips/history', {
        params: { page: pageNumber },
      });
      if (notifyStatusChanges) {
        const changedIncidents = response.data.data.flatMap((trip) => trip.incidents)
          .filter((incident) => incidentStatuses.current[incident.id] === 'open' && incident.status === 'resolved');
        if (changedIncidents.length > 0) {
          setStatusUpdateMessage(changedIncidents.length === 1
            ? `Update: "${changedIncidents[0].summary}" has been resolved.`
            : `${changedIncidents.length} of your reports have been resolved.`);
        }
      }
      response.data.data.flatMap((trip) => trip.incidents).forEach((incident) => {
        incidentStatuses.current[incident.id] = incident.status;
      });
      setHistory((current) => replace ? response.data.data : [...current, ...response.data.data]);
      setPage(response.data.current_page);
      setLastPage(response.data.last_page);
    } catch (requestError: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data?.message
        : undefined;
      setError(message || 'Could not load trip history. Please try again.');
    } finally {
      historyRequestInFlight.current = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const refresh = async () => {
      if (document.visibilityState !== 'visible' || historyRequestInFlight.current) return;
      historyRequestInFlight.current = true;
      try {
        const pages = await Promise.all(
          Array.from({ length: Math.max(page, 1) }, (_, index) => apiClient.get<TripHistoryResponse>('/trips/history', {
            params: { page: index + 1 },
          })),
        );
        const updatedTrips = pages.flatMap(({ data }) => data.data);
        const changedIncidents = updatedTrips.flatMap((trip) => trip.incidents)
          .filter((incident) => incidentStatuses.current[incident.id] === 'open' && incident.status === 'resolved');
        if (changedIncidents.length > 0) {
          setStatusUpdateMessage(changedIncidents.length === 1
            ? `Update: "${changedIncidents[0].summary}" has been resolved.`
            : `${changedIncidents.length} of your reports have been resolved.`);
        }
        updatedTrips.flatMap((trip) => trip.incidents).forEach((incident) => {
          incidentStatuses.current[incident.id] = incident.status;
        });
        setHistory((current) => {
          const updatedById = new Map(updatedTrips.map((trip) => [trip.id, trip]));
          return current.map((trip) => updatedById.get(trip.id) ?? trip);
        });
      } catch (requestError: unknown) {
        const message = axios.isAxiosError<{ message?: string }>(requestError)
          ? requestError.response?.data?.message
          : undefined;
        setError(message || 'Could not refresh incident report statuses. Please try again.');
      } finally {
        historyRequestInFlight.current = false;
      }
    };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isOpen, page]);

  const openHistory = () => {
    incidentStatuses.current = {};
    setStatusUpdateMessage(null);
    setIsOpen(true);
    void loadHistory(1, true);
  };

  const submitRating = async (tripId: number) => {
    const rating = ratingDrafts[tripId];
    if (!rating || submittingRating !== null) return;

    setSubmittingRating(tripId);
    setRatingErrors((current) => ({ ...current, [tripId]: '' }));
    try {
      const { data } = await apiClient.post<TripRating & { trip_id: number }>(
        `/trips/${tripId}/rating`,
        { rating, comment: commentDrafts[tripId]?.trim() || null },
      );
      setHistory((current) => current.map((trip) => (
        trip.id === tripId ? { ...trip, rating: data } : trip
      )));
    } catch (requestError: unknown) {
      const responseData = axios.isAxiosError<{
        message?: string;
        errors?: Record<string, string[]>;
      }>(requestError) ? requestError.response?.data : undefined;
      const validationMessage = responseData?.errors
        ? Object.values(responseData.errors).flat()[0]
        : undefined;
      setRatingErrors((current) => ({
        ...current,
        [tripId]: validationMessage || responseData?.message || 'Could not submit this rating. Please try again.',
      }));
    } finally {
      setSubmittingRating(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openHistory}
        className="dashboard-history rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
      >
        History
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-history-title"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="trip-history-title" className="text-lg font-bold text-gray-900">
                Trip history
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close trip history"
                className="rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            {statusUpdateMessage && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status" aria-live="polite">
                {statusUpdateMessage}
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => void loadHistory(page || 1, page <= 1)}
                  className="mt-2 font-semibold underline"
                >
                  Retry
                </button>
              </div>
            )}

            {!error && !isLoading && history.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-500">Your trips will appear here.</p>
            )}

            <div className="space-y-3">
              {history.map((trip) => (
                <article key={trip.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-semibold capitalize text-gray-900">{trip.status}</span>
                    <time className="text-xs text-gray-500">
                      {new Date(trip.created_at).toLocaleString()}
                    </time>
                  </div>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">From:</span>{' '}
                    {formatLocation(trip.pickup_location, trip.pickup_lat, trip.pickup_lng)}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">To:</span>{' '}
                    {formatLocation(trip.destination_location, trip.destination_lat, trip.destination_lng)}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    {Number(trip.estimated_distance_km).toFixed(2)} km · ₵{Number(trip.estimated_fare).toFixed(2)} · {trip.payment_method}
                  </p>
                  <ReportTripIssue tripId={trip.id} />
                  {trip.incidents.length > 0 && (
                    <div className="mt-3 space-y-2" aria-label="Your incident reports for this trip">
                      {trip.incidents.map((incident) => (
                        <div key={incident.id} className={`rounded-xl border p-3 ${incident.status === 'resolved' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900">{incident.summary}</p>
                            <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${incident.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                              {incident.status}
                            </span>
                          </div>
                          {incident.status === 'resolved' && incident.reporter_message && (
                            <p className="mt-2 text-sm text-emerald-900">{incident.reporter_message}</p>
                          )}
                          {incident.status === 'resolved' && incident.resolved_at && (
                            <p className="mt-2 text-xs text-gray-600">
                              Updated {new Date(incident.resolved_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {trip.rating ? (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      <p>
                        {user?.role === 'rider' ? 'Passenger rating' : 'Your rating'}: {trip.rating.rating}/5
                      </p>
                      {trip.rating.comment && <p className="mt-1 text-gray-700">{trip.rating.comment}</p>}
                    </div>
                  ) : user?.role === 'passenger' && trip.status === 'completed' && trip.rider_id !== null ? (
                    <div className="mt-3 rounded-lg bg-gray-50 p-3">
                      <p className="text-sm font-semibold text-gray-800">Rate your rider</p>
                      <div className="my-2 flex gap-1" role="group" aria-label={`Rating for trip ${trip.id}`}>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            aria-label={`Rate ${value} star${value === 1 ? '' : 's'}`}
                            aria-pressed={ratingDrafts[trip.id] === value}
                            onClick={() => setRatingDrafts((current) => ({ ...current, [trip.id]: value }))}
                            className={`text-2xl ${ratingDrafts[trip.id] >= value ? 'text-amber-500' : 'text-gray-300'}`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      <label className="sr-only" htmlFor={`rating-comment-${trip.id}`}>
                        Optional rider feedback
                      </label>
                      <textarea
                        id={`rating-comment-${trip.id}`}
                        maxLength={500}
                        value={commentDrafts[trip.id] || ''}
                        onChange={(event) => setCommentDrafts((current) => ({
                          ...current,
                          [trip.id]: event.target.value,
                        }))}
                        placeholder="Leave optional feedback"
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      {ratingErrors[trip.id] && (
                        <p className="mt-2 text-sm text-red-600" role="alert">{ratingErrors[trip.id]}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => void submitRating(trip.id)}
                        disabled={!ratingDrafts[trip.id] || submittingRating !== null}
                        className="mt-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:opacity-60"
                      >
                        {submittingRating === trip.id ? 'Submitting...' : 'Submit rating'}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            {isLoading && <p className="py-4 text-center text-sm text-gray-500">Loading trips...</p>}
            {!isLoading && page < lastPage && history.length > 0 && (
              <button
                type="button"
                onClick={() => void loadHistory(page + 1, false)}
                className="mt-4 w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700"
              >
                Load more
              </button>
            )}
          </section>
        </div>
      )}
    </>
  );
};

export default TripHistory;
