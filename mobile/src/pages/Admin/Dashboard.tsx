import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import IncidentManagement from './IncidentManagement';
import AuditLog from './AuditLog';
import StaffAccess from './StaffAccess';
import Reports from './Reports';

interface AdminDashboardData {
  stats: {
    passengers: number;
    riders: number;
    pending_rider_profiles: number;
    open_incidents: number;
    trips_today: number;
    completed_trips: number;
  };
}

type ActiveTripStatus = 'searching' | 'accepted' | 'arrived' | 'started';
type ActiveTripFilter = 'all' | ActiveTripStatus;
type AdminRole = 'super_admin' | 'operations' | 'support';
type AdminSection = 'overview' | 'live-trips' | 'incidents' | 'rider-review' | 'accounts' | 'recent-trips' | 'audit-log' | 'staff-access' | 'reports';

interface ActiveTrip {
  id: number;
  status: ActiveTripStatus;
  pickup_location: string | null;
  landmark_note: string | null;
  destination_location: string | null;
  pickup_latitude: number;
  pickup_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  estimated_distance_km: number;
  estimated_fare: number;
  created_at: string;
  updated_at: string;
  passenger: {
    name: string | null;
    phone: string | null;
  };
  rider: {
    name: string | null;
    phone: string | null;
    plate_number: string | null;
  } | null;
  rider_location: {
    latitude: number;
    longitude: number;
    updated_at: string;
  } | null;
}

interface PendingRider {
  id: number;
  user_id: number;
  phone: string;
  name: string;
  plate_number: string;
  created_at: string;
  license_image_url: string | null;
  ghana_card_image_url: string | null;
}

interface RecentTrip {
  id: number;
  status: string;
  pickup_location: string | null;
  destination_location: string | null;
  estimated_fare: string | number;
  created_at: string;
}

interface AdminUser {
  id: number;
  phone: string;
  role: 'passenger' | 'rider';
  status: string;
  is_suspended: boolean;
  suspension_reason: string | null;
  created_at: string;
}

interface AdminUsersResponse {
  data: AdminUser[];
  current_page: number;
  last_page: number;
  total: number;
}

const errorMessage = (error: unknown, fallback: string) => (
  axios.isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message || fallback
    : fallback
);

const activeTripFilters: ActiveTripFilter[] = ['all', 'searching', 'accepted', 'arrived', 'started'];
const adminSections: { id: AdminSection; label: string; description: string }[] = [
  { id: 'overview', label: 'Overview', description: 'Platform metrics' },
  { id: 'live-trips', label: 'Live trips', description: 'Monitor active rides' },
  { id: 'incidents', label: 'Incidents', description: 'Review and resolve reports' },
  { id: 'rider-review', label: 'Rider verification', description: 'Review applications' },
  { id: 'accounts', label: 'Accounts', description: 'Manage passengers and riders' },
  { id: 'recent-trips', label: 'Recent trips', description: 'Review trip activity' },
  { id: 'audit-log', label: 'Audit log', description: 'Review admin actions' },
  { id: 'staff-access', label: 'Staff access', description: 'Manage administrator roles' },
  { id: 'reports', label: 'Reports', description: 'Review operational performance' },
];

const sectionsByRole: Record<AdminRole, AdminSection[]> = {
  super_admin: adminSections.map(({ id }) => id),
  operations: adminSections
    .filter(({ id }) => id !== 'accounts' && id !== 'staff-access')
    .map(({ id }) => id),
  support: ['overview', 'incidents'],
};

const getSectionFromUrl = (availableSections: AdminSection[]): AdminSection => {
  const section = new URLSearchParams(window.location.search).get('section');
  return availableSections.some((item) => item === section)
    ? section as AdminSection
    : availableSections[0];
};

const formatElapsed = (date: string, now: number) => {
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return 'Time unavailable';

  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min ago` : `${hours} hr ago`;
};

const formatCoordinate = (latitude: number, longitude: number) => (
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
);

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const adminRole = user?.admin_role ?? 'support';
  const availableSections = sectionsByRole[adminRole];
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [pendingRiders, setPendingRiders] = useState<PendingRider[]>([]);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AdminUsersResponse | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountRole, setAccountRole] = useState<'all' | 'passenger' | 'rider'>('all');
  const [accountPage, setAccountPage] = useState(1);
  const [newAccountPhone, setNewAccountPhone] = useState('');
  const [newAccountRole, setNewAccountRole] = useState<'passenger' | 'rider'>('passenger');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [suspensionTarget, setSuspensionTarget] = useState<AdminUser | null>(null);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [isUpdatingSuspension, setIsUpdatingSuspension] = useState(false);
  const [activeTrips, setActiveTrips] = useState<ActiveTrip[]>([]);
  const [activeTripsLoading, setActiveTripsLoading] = useState(false);
  const [activeTripsError, setActiveTripsError] = useState<string | null>(null);
  const [activeTripsUpdatedAt, setActiveTripsUpdatedAt] = useState<number | null>(null);
  const [activeTripFilter, setActiveTripFilter] = useState<ActiveTripFilter>('all');
  const [clock, setClock] = useState(0);
  const [reportIncidentTripId, setReportIncidentTripId] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>(() => getSectionFromUrl(availableSections));
  const accountFilters = useRef({ search: '', role: 'all' as 'all' | 'passenger' | 'rider' });

  const selectSection = useCallback((section: AdminSection) => {
    if (!availableSections.includes(section)) return;
    if (section === activeSection) return;
    const url = new URL(window.location.href);
    url.searchParams.set('section', section);
    window.history.pushState({ adminSection: section }, '', `${url.pathname}${url.search}${url.hash}`);
    setActiveSection(section);
    setIsLoading(false);
    setError(null);
  }, [activeSection, availableSections]);

  const loadActiveTrips = useCallback(async (signal?: AbortSignal) => {
    setActiveTripsLoading(true);
    setActiveTripsError(null);
    try {
      const { data } = await apiClient.get<{ active_trips: ActiveTrip[] }>('/admin/active-trips', { signal });
      setActiveTrips(data.active_trips);
      setActiveTripsUpdatedAt(Date.now());
    } catch (requestError: unknown) {
      if (signal?.aborted) return;
      setActiveTripsError(errorMessage(requestError, 'Could not load active trips.'));
    } finally {
      if (!signal?.aborted) setActiveTripsLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<AdminDashboardData>('/admin/overview', { signal });
      setDashboard(data);
    } catch (requestError: unknown) {
      if (signal?.aborted) return;
      setError(errorMessage(requestError, 'Could not load the admin dashboard.'));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  const loadPendingRiders = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<{ pending_riders: PendingRider[] }>('/admin/rider-applications', { signal });
      setPendingRiders(data.pending_riders);
    } catch (requestError: unknown) {
      if (signal?.aborted) return;
      setError(errorMessage(requestError, 'Could not load rider applications.'));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  const loadRecentTrips = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<{ recent_trips: RecentTrip[] }>('/admin/recent-trips', { signal });
      setRecentTrips(data.recent_trips);
    } catch (requestError: unknown) {
      if (signal?.aborted) return;
      setError(errorMessage(requestError, 'Could not load recent trips.'));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActiveSection(getSectionFromUrl(availableSections));
      setIsLoading(false);
      setError(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [availableSections]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('section') === activeSection) return;
    url.searchParams.set('section', activeSection);
    window.history.replaceState({ adminSection: activeSection }, '', `${url.pathname}${url.search}${url.hash}`);
  }, [activeSection]);

  useEffect(() => {
    const controller = new AbortController();
    const request = window.setTimeout(() => {
      if (activeSection === 'overview') void loadDashboard(controller.signal);
      if (activeSection === 'rider-review') void loadPendingRiders(controller.signal);
      if (activeSection === 'recent-trips') void loadRecentTrips(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(request);
      controller.abort();
    };
  }, [activeSection, loadDashboard, loadPendingRiders, loadRecentTrips]);

  useEffect(() => {
    if (activeSection !== 'live-trips') return undefined;
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadActiveTrips(controller.signal);
    };

    refresh();
    const interval = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [activeSection, loadActiveTrips]);

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setClock(Date.now()), 0);
    const interval = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, []);

  const loadAccounts = useCallback(async (
    page: number,
    search: string,
    role: 'all' | 'passenger' | 'rider',
    signal?: AbortSignal,
  ) => {
    setAccountError(null);
    try {
      const { data } = await apiClient.get<AdminUsersResponse>('/admin/users', {
        params: {
          page,
          q: search.trim() || undefined,
          role: role === 'all' ? undefined : role,
        },
        signal,
      });
      setAccounts(data);
      setAccountPage(data.current_page);
    } catch (requestError: unknown) {
      if (!signal?.aborted) setAccountError(errorMessage(requestError, 'Could not load accounts.'));
    }
  }, []);

  useEffect(() => {
    accountFilters.current = { search: accountSearch, role: accountRole };
  }, [accountRole, accountSearch]);

  useEffect(() => {
    if (activeSection !== 'accounts') return undefined;
    const controller = new AbortController();
    const request = window.setTimeout(() => {
      const { search, role } = accountFilters.current;
      void loadAccounts(1, search, role, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(request);
      controller.abort();
    };
  }, [activeSection, loadAccounts]);

  const createAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingAccount(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      const { data } = await apiClient.post<{ message: string }>('/admin/users', {
        phone: newAccountPhone,
        role: newAccountRole,
      });
      setAccountMessage(data.message);
      setNewAccountPhone('');
      await loadAccounts(1, accountSearch, accountRole);
    } catch (requestError: unknown) {
      const responseData = axios.isAxiosError<{ errors?: Record<string, string[]> }>(requestError)
        ? requestError.response?.data
        : undefined;
      const validationMessage = responseData?.errors
        ? Object.values(responseData.errors).flat()[0]
        : undefined;
      setAccountError(validationMessage || errorMessage(requestError, 'Could not create the account.'));
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const reviewRider = async (profile: PendingRider, status: 'approved' | 'rejected') => {
    const action = status === 'approved' ? 'approve' : 'reject';
    if (!window.confirm(`${action === 'approve' ? 'Approve' : 'Reject'} ${profile.name}'s rider application?`)) return;

    setReviewingId(profile.id);
    setActionError(null);
    try {
      await apiClient.post(`/admin/riders/${profile.user_id}/review`, { status });
      setPendingRiders((current) => current.filter((rider) => rider.id !== profile.id));
      setActionError(null);
      setDashboard((current) => current ? {
        ...current,
        stats: {
          ...current.stats,
          pending_rider_profiles: Math.max(0, current.stats.pending_rider_profiles - 1),
        },
      } : current);
    } catch (requestError: unknown) {
      setActionError(errorMessage(requestError, `Could not ${action} this rider application.`));
    } finally {
      setReviewingId(null);
    }
  };

  const updateAccountSuspension = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!suspensionTarget) return;

    setIsUpdatingSuspension(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      const { data } = await apiClient.patch<{ message: string }>(
        `/admin/users/${suspensionTarget.id}/suspension`,
        { suspended: true, reason: suspensionReason.trim() },
      );
      setAccountMessage(data.message);
      setSuspensionTarget(null);
      setSuspensionReason('');
      await loadAccounts(accountPage, accountSearch, accountRole);
    } catch (requestError: unknown) {
      const responseData = axios.isAxiosError<{ errors?: Record<string, string[]> }>(requestError)
        ? requestError.response?.data
        : undefined;
      const validationMessage = responseData?.errors
        ? Object.values(responseData.errors).flat()[0]
        : undefined;
      setAccountError(validationMessage || errorMessage(requestError, 'Could not suspend this account.'));
    } finally {
      setIsUpdatingSuspension(false);
    }
  };

  const restoreAccount = async (account: AdminUser) => {
    if (!window.confirm(`Restore ${account.role} account ${account.phone}? The user will be able to sign in again.`)) return;

    setIsUpdatingSuspension(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      const { data } = await apiClient.patch<{ message: string }>(
        `/admin/users/${account.id}/suspension`,
        { suspended: false },
      );
      setAccountMessage(data.message);
      await loadAccounts(accountPage, accountSearch, accountRole);
    } catch (requestError: unknown) {
      setAccountError(errorMessage(requestError, 'Could not restore this account.'));
    } finally {
      setIsUpdatingSuspension(false);
    }
  };

  const statCards = dashboard ? [
    { label: 'Passengers', value: dashboard.stats.passengers },
    { label: 'Riders', value: dashboard.stats.riders },
    { label: 'Pending reviews', value: dashboard.stats.pending_rider_profiles },
    { label: 'Trips today', value: dashboard.stats.trips_today },
    { label: 'Completed trips', value: dashboard.stats.completed_trips },
  ] : [];
  const visibleActiveTrips = activeTripFilter === 'all'
    ? activeTrips
    : activeTrips.filter((trip) => trip.status === activeTripFilter);
  const selectedSection = adminSections.find((section) => section.id === activeSection) ?? adminSections[0];

  return (
    <div className="dashboard-shell admin-dashboard min-h-screen bg-slate-50 text-slate-900">
      <header className="admin-header border-b border-slate-800 bg-slate-900 text-white shadow-lg shadow-slate-900/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Keke Ride · Operations</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight">Admin dashboard</h1>
            <p className="text-sm text-slate-300">{user?.phone}</p>
          </div>
          <div className="flex items-center gap-3">
            {activeSection !== 'incidents' && activeSection !== 'audit-log' && <button
              type="button"
              onClick={() => {
                if (activeSection === 'overview') void loadDashboard();
                if (activeSection === 'live-trips') void loadActiveTrips();
                if (activeSection === 'rider-review') void loadPendingRiders();
                if (activeSection === 'accounts') void loadAccounts(1, accountSearch, accountRole);
                if (activeSection === 'recent-trips') void loadRecentTrips();
              }}
              disabled={isLoading}
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-50"
            >
              Refresh
            </button>}
            <button
              type="button"
              onClick={logout}
              className="admin-logout rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <nav className="admin-feature-menu" aria-label="Admin features">
          {availableSections.map((sectionId) => {
            const section = adminSections.find((item) => item.id === sectionId) ?? adminSections[0];
            const badge = section.id === 'live-trips'
              ? activeTrips.length
              : section.id === 'incidents'
                ? dashboard?.stats.open_incidents
                : section.id === 'rider-review'
                  ? dashboard?.stats.pending_rider_profiles
                  : undefined;
            return (
              <button
                key={section.id}
                type="button"
                aria-current={activeSection === section.id ? 'page' : undefined}
                onClick={() => selectSection(section.id)}
                className={`admin-feature-menu-item ${activeSection === section.id ? 'is-selected' : ''}`}
              >
                <span className="admin-feature-menu-copy">
                  <span className="admin-feature-menu-label">{section.label}</span>
                  <span className="admin-feature-menu-description">{section.description}</span>
                </span>
                {badge !== undefined && badge > 0 && (
                  <span className="admin-feature-menu-badge">{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="admin-section-heading">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Admin workspace</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{selectedSection.label}</h2>
            <p className="mt-1 text-sm text-slate-600">{selectedSection.description}</p>
          </div>
          {isLoading && <span className="text-sm text-slate-500" role="status">Loading…</span>}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadDashboard()} className="mt-2 font-semibold underline">
              Try again
            </button>
          </div>
        )}
        {actionError && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {actionError}
          </p>
        )}

        {activeSection === 'live-trips' && (
        <section className="active-trips-panel rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-900/5 sm:p-6" aria-labelledby="active-trips-title">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="active-trips-title" className="text-lg font-bold tracking-tight">Live trip operations</h2>
                <span className="active-trips-count rounded-full px-2.5 py-1 text-xs font-bold">
                  {activeTrips.length} active
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Monitor active rides and the rider’s latest reported location.
                {activeTripsUpdatedAt !== null && ` Updated ${formatElapsed(new Date(activeTripsUpdatedAt).toISOString(), clock).replace(' ago', '')}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadActiveTrips()}
              disabled={activeTripsLoading}
              className="active-trips-refresh rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-50"
            >
              {activeTripsLoading ? 'Refreshing…' : 'Refresh trips'}
            </button>
          </div>

          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter active trips by status">
            {activeTripFilters.map((filter) => {
              const count = filter === 'all'
                ? activeTrips.length
                : activeTrips.filter((trip) => trip.status === filter).length;
              return (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={activeTripFilter === filter}
                  onClick={() => setActiveTripFilter(filter)}
                  className={`active-trip-filter rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${activeTripFilter === filter ? 'is-selected' : ''}`}
                >
                  {filter === 'all' ? 'All trips' : filter} <span>{count}</span>
                </button>
              );
            })}
          </div>

          {activeTripsError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              <p>{activeTripsError}</p>
              <button type="button" onClick={() => void loadActiveTrips()} className="mt-2 font-semibold underline">
                Retry
              </button>
            </div>
          )}

          {activeTripsLoading && activeTrips.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500" role="status">
              Loading active trips…
            </p>
          ) : visibleActiveTrips.length === 0 ? (
            <p className="active-trips-empty rounded-xl p-6 text-center text-sm">
              {activeTrips.length === 0
                ? 'There are no active trips right now. This list refreshes automatically.'
                : `No active trips with status “${activeTripFilter}”.`}
            </p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleActiveTrips.map((trip) => {
                const locationAge = trip.rider_location
                  ? formatElapsed(trip.rider_location.updated_at, clock)
                  : null;
                const locationIsStale = trip.rider_location
                  && clock - new Date(trip.rider_location.updated_at).getTime() > 120_000;
                const riderLabel = trip.rider?.name || trip.rider?.phone || 'Waiting for rider';
                const pickupLabel = trip.pickup_location || trip.landmark_note || 'Pickup pin';
                const destinationLabel = trip.destination_location || 'Destination pin';
                return (
                  <article key={trip.id} className="active-trip-card rounded-2xl border p-4 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trip #{trip.id}</p>
                        <p className="mt-1 text-xs text-slate-500">Started {formatElapsed(trip.created_at, clock)}</p>
                      </div>
                      <span className={`active-trip-status status-${trip.status} rounded-full px-3 py-1 text-xs font-bold capitalize`}>
                        {trip.status}
                      </span>
                    </div>

                    <div className="active-trip-route mb-4 grid gap-3 rounded-xl p-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pickup</p>
                        <p className="mt-1 text-sm font-semibold">{pickupLabel}</p>
                        {trip.landmark_note && trip.pickup_location && (
                          <p className="mt-1 text-xs text-slate-500">{trip.landmark_note}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Destination</p>
                        <p className="mt-1 text-sm font-semibold">{destinationLabel}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Passenger</p>
                        <p className="mt-1 font-semibold">{trip.passenger.name || 'Passenger'}</p>
                        <p className="text-xs text-slate-600">{trip.passenger.phone || 'Phone unavailable'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Assigned rider</p>
                        <p className="mt-1 font-semibold">{riderLabel}</p>
                        {trip.rider?.phone && trip.rider.name && (
                          <p className="text-xs text-slate-600">{trip.rider.phone}</p>
                        )}
                        {trip.rider?.plate_number && (
                          <p className="text-xs text-slate-600">Plate {trip.rider.plate_number}</p>
                        )}
                      </div>
                    </div>

                    <div className={`active-trip-location mt-4 rounded-xl border p-3 ${locationIsStale ? 'is-stale' : ''}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-wide">Rider location</p>
                        <span className="text-xs font-semibold">
                          {!trip.rider
                            ? 'Not assigned yet'
                            : !trip.rider_location
                              ? 'No location reported'
                              : locationIsStale
                                ? `Last update ${locationAge} · stale`
                                : `Updated ${locationAge}`}
                        </span>
                      </div>
                      {trip.rider_location && (
                        <p className="mt-1 text-xs">
                          {formatCoordinate(trip.rider_location.latitude, trip.rider_location.longitude)}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500">
                      <span>{trip.estimated_distance_km.toFixed(1)} km estimated</span>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-800">₵{trip.estimated_fare.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setReportIncidentTripId(trip.id);
                            selectSection('incidents');
                          }}
                          className="incident-flag-link font-semibold"
                        >
                          Flag trip
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        )}

        {activeSection === 'incidents' && <IncidentManagement
          reportTripId={reportIncidentTripId}
          onReportHandled={() => setReportIncidentTripId(null)}
          canCreateIncidents={adminRole !== 'support'}
          canAddNotes
          canResolveIncidents={adminRole !== 'support'}
        />}
        {activeSection === 'audit-log' && <AuditLog />}
        {activeSection === 'staff-access' && <StaffAccess currentUserId={user?.id ?? 0} />}
        {activeSection === 'reports' && <Reports />}

        {activeSection === 'overview' && (
        <>
        <section className="admin-alerts-panel" aria-labelledby="admin-alerts-title">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Needs attention</p>
            <h2 id="admin-alerts-title" className="mt-1 text-lg font-bold text-slate-900">Operations alerts</h2>
            <p className="mt-1 text-sm text-slate-600">Open the queue for any work that needs follow-up.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className={`admin-alert-card ${dashboard?.stats.open_incidents ? 'has-alert' : 'is-clear'}`}>
              <div>
                <p className="admin-alert-count">{dashboard?.stats.open_incidents.toLocaleString() ?? '—'}</p>
                <h3>Open incidents</h3>
                <p>{dashboard?.stats.open_incidents ? 'Reports waiting for review or resolution.' : 'No reports are waiting for follow-up.'}</p>
              </div>
              <button
                type="button"
                onClick={() => selectSection('incidents')}
                className="admin-alert-action"
              >
                {dashboard?.stats.open_incidents ? 'Review incidents' : 'Open incident queue'}
                <span aria-hidden="true">→</span>
              </button>
            </article>
            <article className={`admin-alert-card ${dashboard?.stats.pending_rider_profiles ? 'has-alert' : 'is-clear'}`}>
              <div>
                <p className="admin-alert-count">{dashboard?.stats.pending_rider_profiles.toLocaleString() ?? '—'}</p>
                <h3>Pending rider reviews</h3>
                <p>{dashboard?.stats.pending_rider_profiles ? 'Applications need document review.' : 'No rider applications are waiting for review.'}</p>
              </div>
              <button
                type="button"
                onClick={() => selectSection('rider-review')}
                className="admin-alert-action"
              >
                {dashboard?.stats.pending_rider_profiles ? 'Review applications' : 'Open rider verification'}
                <span aria-hidden="true">→</span>
              </button>
            </article>
          </div>
        </section>

        <section aria-label="Platform overview">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Platform overview</h2>
            {isLoading && <span className="text-sm text-slate-500">Updating…</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {statCards.map((card) => (
              <article key={card.label} className="admin-stat-card rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-2 text-3xl font-bold">{card.value.toLocaleString()}</p>
              </article>
            ))}
          </div>
        </section>
        </>
        )}

        {activeSection === 'rider-review' && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-900/5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Rider verification</h2>
              <p className="text-sm text-slate-500">Review submitted documents before riders can go online.</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              {pendingRiders.length} pending
            </span>
          </div>
          {pendingRiders.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
              {isLoading ? 'Loading rider applications…' : 'No rider applications are waiting for review.'}
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pendingRiders.map((rider) => (
                <article key={rider.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{rider.name}</h3>
                      <p className="text-sm text-slate-600">{rider.phone} · {rider.plate_number}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Submitted {new Date(rider.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {rider.license_image_url ? (
                        <a
                          href={rider.license_image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          Driver license
                        </a>
                      ) : (
                        <span className="px-2 py-2 text-xs text-slate-400">License unavailable</span>
                      )}
                      {rider.ghana_card_image_url ? (
                        <a
                          href={rider.ghana_card_image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          Ghana Card
                        </a>
                      ) : (
                        <span className="px-2 py-2 text-xs text-slate-400">Ghana Card unavailable</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void reviewRider(rider, 'approved')}
                      disabled={reviewingId !== null}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {reviewingId === rider.id ? 'Saving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewRider(rider, 'rejected')}
                      disabled={reviewingId !== null}
                      className="rounded-xl bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800 transition hover:bg-orange-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>}

        {activeSection === 'accounts' && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-900/5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold tracking-tight">Account management</h2>
            <p className="text-sm text-slate-500">Create passenger or rider accounts and find existing accounts by phone number.</p>
          </div>
          <form onSubmit={createAccount} className="mb-5 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-[1fr_180px_auto]">
            <label className="text-sm font-medium text-slate-700">
              Phone number
              <input
                type="tel"
                required
                minLength={10}
                maxLength={15}
                pattern="[0-9]{10,15}"
                value={newAccountPhone}
                onChange={(event) => setNewAccountPhone(event.target.value.replace(/\D/g, ''))}
                placeholder="0241234567"
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Account type
              <select
                value={newAccountRole}
                onChange={(event) => setNewAccountRole(event.target.value as 'passenger' | 'rider')}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <option value="passenger">Passenger</option>
                <option value="rider">Rider</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={isCreatingAccount}
              className="self-end rounded-xl bg-brand px-4 py-2 font-semibold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
            >
              {isCreatingAccount ? 'Creating…' : 'Create account'}
            </button>
          </form>
          {accountMessage && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{accountMessage}</p>}
          {accountError && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{accountError}</p>}
          {suspensionTarget && (
            <form onSubmit={(event) => void updateAccountSuspension(event)} className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="mb-3">
                <h3 className="font-semibold text-red-900">Suspend {suspensionTarget.role} account</h3>
                <p className="text-sm text-red-800">{suspensionTarget.phone} will lose API access and have active sessions revoked.</p>
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                Reason (required)
                <textarea
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  value={suspensionReason}
                  onChange={(event) => setSuspensionReason(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-red-200 bg-white px-3 py-2"
                  placeholder="Briefly explain why this account is being suspended"
                />
              </label>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSuspensionTarget(null);
                    setSuspensionReason('');
                  }}
                  disabled={isUpdatingSuspension}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingSuspension || suspensionReason.trim().length < 5}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isUpdatingSuspension ? 'Suspending…' : 'Suspend account'}
                </button>
              </div>
            </form>
          )}
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <label className="sr-only" htmlFor="account-search">Search accounts by phone number</label>
            <input
              id="account-search"
              type="search"
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void loadAccounts(1, accountSearch, accountRole);
                }
              }}
              placeholder="Search by phone number"
              className="rounded-lg border border-slate-200 px-3 py-2"
            />
            <label className="sr-only" htmlFor="account-role-filter">Filter account type</label>
            <select
              id="account-role-filter"
              value={accountRole}
              onChange={(event) => {
                const role = event.target.value as 'all' | 'passenger' | 'rider';
                setAccountRole(role);
                void loadAccounts(1, accountSearch, role);
              }}
              className="rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="all">All accounts</option>
              <option value="passenger">Passengers</option>
              <option value="rider">Riders</option>
            </select>
            <button
              type="button"
              onClick={() => void loadAccounts(1, accountSearch, accountRole)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Search
            </button>
          </div>
          {accounts && accounts.data.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="pb-3 pr-4">Phone</th>
                      <th className="pb-3 pr-4">Type</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Account access</th>
                      <th className="pb-3 pr-4">Action</th>
                      <th className="pb-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.data.map((account) => (
                      <tr key={account.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 font-medium">{account.phone}</td>
                        <td className="py-3 pr-4 capitalize">{account.role}</td>
                        <td className="py-3 pr-4 capitalize">{account.status}</td>
                        <td className="py-3 pr-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.is_suspended ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                            {account.is_suspended ? 'Suspended' : 'Active'}
                          </span>
                          {account.is_suspended && account.suspension_reason && (
                            <p className="mt-1 max-w-56 whitespace-normal text-xs text-slate-500">{account.suspension_reason}</p>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            disabled={isUpdatingSuspension}
                            onClick={() => {
                              if (account.is_suspended) void restoreAccount(account);
                              else {
                                setAccountError(null);
                                setSuspensionReason('');
                                setSuspensionTarget(account);
                              }
                            }}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${account.is_suspended ? 'border border-green-200 text-green-800 hover:bg-green-50' : 'border border-red-200 text-red-700 hover:bg-red-50'}`}
                          >
                            {account.is_suspended ? 'Restore' : 'Suspend'}
                          </button>
                        </td>
                        <td className="py-3">{new Date(account.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                <span>{accounts.total.toLocaleString()} accounts · Page {accounts.current_page} of {accounts.last_page}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void loadAccounts(accountPage - 1, accountSearch, accountRole)}
                    disabled={accountPage <= 1}
                    className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadAccounts(accountPage + 1, accountSearch, accountRole)}
                    disabled={accountPage >= accounts.last_page}
                    className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : accounts ? (
            <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">No matching accounts.</p>
          ) : null}
        </section>}

        {activeSection === 'recent-trips' && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-900/5 sm:p-6">
          <h2 className="mb-4 text-lg font-bold">Recent trips</h2>
          {recentTrips.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4">Trip</th>
                    <th className="pb-3 pr-4">Route</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Fare</th>
                    <th className="pb-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrips.map((trip) => (
                    <tr key={trip.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4 font-semibold">#{trip.id}</td>
                      <td className="max-w-xs truncate py-3 pr-4">
                        {trip.pickup_location || 'Pickup'} → {trip.destination_location || 'Destination'}
                      </td>
                      <td className="py-3 pr-4 capitalize">{trip.status}</td>
                      <td className="py-3 pr-4">₵{Number(trip.estimated_fare).toFixed(2)}</td>
                      <td className="py-3">{new Date(trip.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-4 text-sm text-slate-500">{isLoading ? 'Loading recent trips…' : 'No trips to show yet.'}</p>
          )}
        </section>}
      </main>
    </div>
  );
};

export default AdminDashboard;
