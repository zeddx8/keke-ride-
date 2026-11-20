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
type AdminCategory = 'all' | 'operations' | 'safety' | 'users' | 'governance';
type AdminSection =
  | 'overview'
  | 'live-trips'
  | 'recent-trips'
  | 'incidents'
  | 'rider-review'
  | 'accounts'
  | 'reports'
  | 'audit-log'
  | 'staff-access';

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

interface SectionMeta {
  id: AdminSection;
  label: string;
  description: string;
  category: 'operations' | 'safety' | 'users' | 'governance';
}

const renderSectionIcon = (id: AdminSection, className = 'w-5 h-5') => {
  switch (id) {
    case 'overview':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case 'live-trips':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 0 1 9 9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 12l4-4" />
        </svg>
      );
    case 'recent-trips':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'incidents':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    case 'rider-review':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 8h2m-2 4h2m-2 4h2M6 16c0-1.5 1.5-2 3-2s3 .5 3 2" />
        </svg>
      );
    case 'accounts':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'reports':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case 'audit-log':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0v4m-4 4v2" />
        </svg>
      );
    case 'staff-access':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      );
  }
};

const renderStatIcon = (type: string, className = 'w-5 h-5') => {
  switch (type) {
    case 'passengers':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'riders':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="4" x2="12" y2="9" />
          <line x1="4.93" y1="16.07" x2="9.24" y2="13.57" />
          <line x1="19.07" y1="16.07" x2="14.76" y2="13.57" />
        </svg>
      );
    case 'trips_today':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'completed_trips':
      return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return null;
  }
};

const errorMessage = (error: unknown, fallback: string) =>
  axios.isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message || fallback
    : fallback;

const activeTripFilters: ActiveTripFilter[] = ['all', 'searching', 'accepted', 'arrived', 'started'];

const categoryMeta: Record<'operations' | 'safety' | 'users' | 'governance', { name: string; tag: string }> = {
  operations: { name: 'Operations & Fleet', tag: 'Live Monitoring' },
  safety: { name: 'Trust & Safety', tag: 'Vetting & Incidents' },
  users: { name: 'User Management', tag: 'Directory' },
  governance: { name: 'Governance & Analytics', tag: 'Reports & Audits' },
};

const adminSections: SectionMeta[] = [
  // 1. Operations & Fleet
  {
    id: 'overview',
    label: 'Overview',
    description: 'KPI metrics & operational alerts',
    category: 'operations',
  },
  {
    id: 'live-trips',
    label: 'Live Trips',
    description: 'Real-time active ride monitoring',
    category: 'operations',
  },
  {
    id: 'recent-trips',
    label: 'Recent Trips',
    description: 'Completed rides and activity logs',
    category: 'operations',
  },

  // 2. Trust & Safety
  {
    id: 'incidents',
    label: 'Incidents',
    description: 'Review and resolve safety reports',
    category: 'safety',
  },
  {
    id: 'rider-review',
    label: 'Rider Verification',
    description: 'Review driver licenses & Ghana cards',
    category: 'safety',
  },

  // 3. User Management
  {
    id: 'accounts',
    label: 'Accounts',
    description: 'Search, create & manage user accounts',
    category: 'users',
  },

  // 4. Governance & Analytics
  {
    id: 'reports',
    label: 'Reports',
    description: 'Operational & financial analytics',
    category: 'governance',
  },
  {
    id: 'audit-log',
    label: 'Audit Log',
    description: 'System-wide administrative action logs',
    category: 'governance',
  },
  {
    id: 'staff-access',
    label: 'Staff Access',
    description: 'Administrator roles and permissions',
    category: 'governance',
  },
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
    ? (section as AdminSection)
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

const formatCoordinate = (latitude: number, longitude: number) =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

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
  const [activeCategory, setActiveCategory] = useState<AdminCategory>('all');
  const [activeSection, setActiveSection] = useState<AdminSection>(() => getSectionFromUrl(availableSections));
  const accountFilters = useRef({ search: '', role: 'all' as 'all' | 'passenger' | 'rider' });

  const selectSection = useCallback(
    (section: AdminSection) => {
      if (!availableSections.includes(section)) return;
      if (section === activeSection) return;
      const url = new URL(window.location.href);
      url.searchParams.set('section', section);
      window.history.pushState({ adminSection: section }, '', `${url.pathname}${url.search}${url.hash}`);
      setActiveSection(section);
      setIsLoading(false);
      setError(null);
    },
    [activeSection, availableSections],
  );

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

  const loadAccounts = useCallback(
    async (page: number, search: string, role: 'all' | 'passenger' | 'rider', signal?: AbortSignal) => {
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
    },
    [],
  );

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
      const validationMessage = responseData?.errors ? Object.values(responseData.errors).flat()[0] : undefined;
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
      setDashboard((current) =>
        current
          ? {
              ...current,
              stats: {
                ...current.stats,
                pending_rider_profiles: Math.max(0, current.stats.pending_rider_profiles - 1),
              },
            }
          : current,
      );
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
      const validationMessage = responseData?.errors ? Object.values(responseData.errors).flat()[0] : undefined;
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

  const statCards = dashboard
    ? [
        { key: 'passengers', label: 'Registered Passengers', value: dashboard.stats.passengers },
        { key: 'riders', label: 'Registered Riders', value: dashboard.stats.riders },
        { key: 'trips_today', label: 'Trips Today', value: dashboard.stats.trips_today },
        { key: 'completed_trips', label: 'Completed Trips', value: dashboard.stats.completed_trips },
      ]
    : [];

  const visibleActiveTrips =
    activeTripFilter === 'all'
      ? activeTrips
      : activeTrips.filter((trip) => trip.status === activeTripFilter);

  const selectedSection = adminSections.find((section) => section.id === activeSection) ?? adminSections[0];

  const getSectionBadge = (sectionId: AdminSection) => {
    if (sectionId === 'live-trips') return activeTrips.length;
    if (sectionId === 'incidents') return dashboard?.stats.open_incidents;
    if (sectionId === 'rider-review') return dashboard?.stats.pending_rider_profiles;
    return undefined;
  };

  // Group sections by category for orderly presentation
  const groupedSections = (['operations', 'safety', 'users', 'governance'] as const).map((catKey) => {
    const items = adminSections.filter(
      (sec) => sec.category === catKey && availableSections.includes(sec.id),
    );
    return {
      category: catKey,
      meta: categoryMeta[catKey],
      sections: items,
    };
  }).filter((group) => group.sections.length > 0);

  const filteredSections = activeCategory === 'all'
    ? adminSections.filter((sec) => availableSections.includes(sec.id))
    : adminSections.filter((sec) => sec.category === activeCategory && availableSections.includes(sec.id));

  return (
    <div className="dashboard-shell admin-dashboard min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="admin-header sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-950 font-black text-lg shadow">
              KR
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-amber-400">KEKE RIDE</span>
                <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 border border-slate-700">
                  {adminRole.replace('_', ' ')}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live System
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{user?.phone || 'Admin Operations'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeSection !== 'incidents' && activeSection !== 'audit-log' && (
              <button
                type="button"
                onClick={() => {
                  if (activeSection === 'overview') void loadDashboard();
                  if (activeSection === 'live-trips') void loadActiveTrips();
                  if (activeSection === 'rider-review') void loadPendingRiders();
                  if (activeSection === 'accounts') void loadAccounts(1, accountSearch, accountRole);
                  if (activeSection === 'recent-trips') void loadRecentTrips();
                }}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            )}
            <button
              type="button"
              onClick={logout}
              className="rounded-xl bg-red-600/90 hover:bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition active:scale-95"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Category Filter Navigation Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Feature Categories:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: 'All Modules' },
                  { id: 'operations', label: 'Operations & Fleet' },
                  { id: 'safety', label: 'Trust & Safety' },
                  { id: 'users', label: 'User Directory' },
                  { id: 'governance', label: 'Governance' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    activeCategory === cat.id
                      ? 'bg-slate-900 text-amber-300 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Orderly Feature Menu Grid */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredSections.map((section) => {
              const isSelected = activeSection === section.id;
              const badge = getSectionBadge(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => selectSection(section.id)}
                  className={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/80 shadow-xs ring-1 ring-amber-400'
                      : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {renderSectionIcon(section.id, 'w-4 h-4')}
                    </span>
                    {badge !== undefined && badge > 0 && (
                      <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-black text-slate-950 shadow-sm">
                        {badge}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-amber-950 font-black' : 'text-slate-900'}`}>
                      {section.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{section.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section Heading & Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-widest text-amber-800">
                {categoryMeta[selectedSection.category].name}
              </span>
              <span className="text-slate-400">/</span>
              <span className="text-xs font-semibold text-slate-500">{categoryMeta[selectedSection.category].tag}</span>
            </div>
            <h2 className="mt-1 text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-900">
                {renderSectionIcon(selectedSection.id, 'w-5 h-5')}
              </span>
              <span>{selectedSection.label}</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">{selectedSection.description}</p>
          </div>
          {isLoading && (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 animate-pulse">
              Refreshing data…
            </span>
          )}
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadDashboard()} className="font-bold underline text-xs ml-3">
              Try again
            </button>
          </div>
        )}
        {actionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {actionError}
          </div>
        )}

        {/* 1. OVERVIEW SECTION */}
        {activeSection === 'overview' && (
          <div className="space-y-6">
            {/* Urgent Operations Alerts Bar */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Operations Attention Center</h3>
                  <p className="text-xs text-slate-500">Live queues requiring review, triage or verification</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  Real-time Queue
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {/* Live Trips Card */}
                <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-blue-50/50 p-4">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Live Active Trips</span>
                    <p className="mt-1 text-3xl font-black text-blue-950">{activeTrips.length}</p>
                    <p className="mt-1 text-xs text-blue-700">Rides currently in searching, transit, or arriving.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectSection('live-trips')}
                    className="mt-3 flex items-center gap-1 text-xs font-bold text-blue-900 hover:underline"
                  >
                    Open Live Radar →
                  </button>
                </article>

                {/* Open Incidents Card */}
                <article className={`flex flex-col justify-between rounded-xl border p-4 ${
                  dashboard?.stats.open_incidents
                    ? 'border-red-200 bg-red-50/70 text-red-950'
                    : 'border-slate-200 bg-emerald-50/50 text-emerald-950'
                }`}>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider">Open Incidents</span>
                    <p className="mt-1 text-3xl font-black">{dashboard?.stats.open_incidents ?? 0}</p>
                    <p className="mt-1 text-xs opacity-80">
                      {dashboard?.stats.open_incidents
                        ? 'Safety issues, disputes, or missing items reported.'
                        : 'No outstanding incident reports.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectSection('incidents')}
                    className="mt-3 flex items-center gap-1 text-xs font-bold hover:underline"
                  >
                    Manage Incidents →
                  </button>
                </article>

                {/* Pending Rider Reviews */}
                <article className={`flex flex-col justify-between rounded-xl border p-4 ${
                  dashboard?.stats.pending_rider_profiles
                    ? 'border-amber-200 bg-amber-50/70 text-amber-950'
                    : 'border-slate-200 bg-slate-50 text-slate-800'
                }`}>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider">Pending Driver Vetting</span>
                    <p className="mt-1 text-3xl font-black">{dashboard?.stats.pending_rider_profiles ?? 0}</p>
                    <p className="mt-1 text-xs opacity-80">
                      {dashboard?.stats.pending_rider_profiles
                        ? 'Submitted Ghana cards & licenses waiting for review.'
                        : 'All rider applications are verified.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectSection('rider-review')}
                    className="mt-3 flex items-center gap-1 text-xs font-bold hover:underline"
                  >
                    Review Applications →
                  </button>
                </article>
              </div>
            </section>

            {/* Platform KPI Stats Grid */}
            <section className="space-y-3">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Platform Performance Metrics</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {statCards.map((card) => (
                  <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-500">{card.label}</p>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        {renderStatIcon(card.key, 'w-4 h-4')}
                      </span>
                    </div>
                    <p className="mt-2 text-3xl font-black text-slate-900">{card.value.toLocaleString()}</p>
                  </article>
                ))}
              </div>
            </section>

            {/* Quick Operations Matrix */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-900 text-base">Quick Operations Matrix</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {groupedSections.map((grp) => (
                  <div key={grp.category} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{grp.meta.name}</p>
                    <div className="space-y-1">
                      {grp.sections.map((sec) => (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => selectSection(sec.id)}
                          className="flex w-full items-center justify-between rounded-lg p-2 text-left text-xs font-bold text-slate-800 hover:bg-white hover:shadow-xs transition"
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-slate-500">{renderSectionIcon(sec.id, 'w-4 h-4')}</span>
                            <span>{sec.label}</span>
                          </span>
                          <span className="text-slate-400">›</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* 2. LIVE TRIPS SECTION */}
        {activeSection === 'live-trips' && (
          <section className="active-trips-panel rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="active-trips-title">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="active-trips-title" className="text-lg font-bold tracking-tight text-slate-900">Live Trip Radar</h3>
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                    {activeTrips.length} active
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Real-time telemetry and rider coordinates across Cape Coast.
                  {activeTripsUpdatedAt !== null && ` Updated ${formatElapsed(new Date(activeTripsUpdatedAt).toISOString(), clock).replace(' ago', '')}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadActiveTrips()}
                disabled={activeTripsLoading}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {activeTripsLoading ? 'Refreshing…' : 'Refresh Telemetry'}
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
                    className={`rounded-full border px-3 py-1 text-xs font-bold capitalize transition ${
                      activeTripFilter === filter
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                    }`}
                  >
                    {filter === 'all' ? 'All Active' : filter} ({count})
                  </button>
                );
              })}
            </div>

            {activeTripsError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700" role="alert">
                <p>{activeTripsError}</p>
                <button type="button" onClick={() => void loadActiveTrips()} className="mt-2 font-bold underline">
                  Retry
                </button>
              </div>
            )}

            {activeTripsLoading && activeTrips.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-8 text-center text-xs text-slate-500" role="status">
                Loading active trip telemetry…
              </p>
            ) : visibleActiveTrips.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                {activeTrips.length === 0
                  ? 'There are no active trips right now. This list refreshes automatically.'
                  : `No active trips with status "${activeTripFilter}".`}
              </p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {visibleActiveTrips.map((trip) => {
                  const locationAge = trip.rider_location
                    ? formatElapsed(trip.rider_location.updated_at, clock)
                    : null;
                  const locationIsStale =
                    trip.rider_location && clock - new Date(trip.rider_location.updated_at).getTime() > 120_000;
                  const riderLabel = trip.rider?.name || trip.rider?.phone || 'Waiting for rider';
                  const pickupLabel = trip.pickup_location || trip.landmark_note || 'Pickup pin';
                  const destinationLabel = trip.destination_location || 'Destination pin';
                  return (
                    <article key={trip.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-2.5">
                        <div>
                          <span className="text-xs font-black uppercase text-slate-400">TRIP #{trip.id}</span>
                          <p className="text-[11px] text-slate-500">Started {formatElapsed(trip.created_at, clock)}</p>
                        </div>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          trip.status === 'started'
                            ? 'bg-blue-100 text-blue-800'
                            : trip.status === 'arrived'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}>
                          {trip.status}
                        </span>
                      </div>

                      <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 text-xs">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pickup</p>
                          <p className="mt-0.5 font-bold text-slate-900">{pickupLabel}</p>
                          {trip.landmark_note && trip.pickup_location && (
                            <p className="mt-0.5 text-[11px] text-slate-500">Note: {trip.landmark_note}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Destination</p>
                          <p className="mt-0.5 font-bold text-slate-900">{destinationLabel}</p>
                        </div>
                      </div>

                      <div className="grid gap-3 text-xs sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Passenger</p>
                          <p className="mt-0.5 font-bold text-slate-900">{trip.passenger.name || 'Passenger'}</p>
                          <p className="text-[11px] text-slate-600 font-mono">{trip.passenger.phone || 'Phone unavailable'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Driver</p>
                          <p className="mt-0.5 font-bold text-slate-900">{riderLabel}</p>
                          {trip.rider?.phone && (
                            <p className="text-[11px] text-slate-600 font-mono">{trip.rider.phone} {trip.rider?.plate_number ? `· ${trip.rider.plate_number}` : ''}</p>
                          )}
                        </div>
                      </div>

                      <div className={`rounded-xl border p-2.5 text-xs ${locationIsStale ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-700">Rider Telemetry</span>
                          <span className="text-slate-500">
                            {!trip.rider
                              ? 'Not assigned'
                              : !trip.rider_location
                                ? 'No telemetry reported'
                                : locationIsStale
                                  ? `Last seen ${locationAge} (stale)`
                                  : `Active · ${locationAge}`}
                          </span>
                        </div>
                        {trip.rider_location && (
                          <p className="mt-1 font-mono text-[11px] text-slate-600">
                            {formatCoordinate(trip.rider_location.latitude, trip.rider_location.longitude)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                        <span>{trip.estimated_distance_km.toFixed(1)} km · <strong>₵{trip.estimated_fare.toFixed(2)}</strong></span>
                        <button
                          type="button"
                          onClick={() => {
                            setReportIncidentTripId(trip.id);
                            selectSection('incidents');
                          }}
                          className="font-bold text-red-600 hover:underline"
                        >
                          Flag Trip Incident →
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 3. SUB-COMPONENTS */}
        {activeSection === 'incidents' && (
          <IncidentManagement
            reportTripId={reportIncidentTripId}
            onReportHandled={() => setReportIncidentTripId(null)}
            canCreateIncidents={adminRole !== 'support'}
            canAddNotes
            canResolveIncidents={adminRole !== 'support'}
          />
        )}

        {activeSection === 'rider-review' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Rider Verification & Onboarding</h3>
                <p className="text-xs text-slate-500">Inspect Ghana cards and driving licenses before drivers can take trips.</p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                {pendingRiders.length} pending
              </span>
            </div>

            {pendingRiders.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-8 text-center text-xs text-slate-500">
                {isLoading ? 'Loading rider applications…' : 'No driver applications currently pending review.'}
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {pendingRiders.map((rider) => (
                  <article key={rider.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{rider.name}</h4>
                        <p className="text-xs text-slate-600 font-mono">{rider.phone} · Plate: {rider.plate_number}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Submitted on {new Date(rider.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {rider.license_image_url ? (
                          <a
                            href={rider.license_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            License ↗
                          </a>
                        ) : (
                          <span className="px-2 py-1 text-xs text-slate-400">No License</span>
                        )}
                        {rider.ghana_card_image_url ? (
                          <a
                            href={rider.ghana_card_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            Ghana Card ↗
                          </a>
                        ) : (
                          <span className="px-2 py-1 text-xs text-slate-400">No Card</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => void reviewRider(rider, 'approved')}
                        disabled={reviewingId !== null}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {reviewingId === rider.id ? 'Approving…' : 'Approve Application'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewRider(rider, 'rejected')}
                        disabled={reviewingId !== null}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeSection === 'accounts' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">User Account Management</h3>
              <p className="text-xs text-slate-500">Create new passenger or rider accounts and inspect existing credentials.</p>
            </div>

            {/* Quick Create Account Form */}
            <form onSubmit={createAccount} className="grid gap-3 rounded-xl bg-slate-50 p-4 border border-slate-200 md:grid-cols-[1fr_180px_auto]">
              <label className="text-xs font-bold text-slate-700">
                Mobile Number
                <input
                  type="tel"
                  required
                  minLength={10}
                  maxLength={15}
                  value={newAccountPhone}
                  onChange={(event) => setNewAccountPhone(event.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 0241234567"
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Account Role
                <select
                  value={newAccountRole}
                  onChange={(event) => setNewAccountRole(event.target.value as 'passenger' | 'rider')}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <option value="passenger">Passenger</option>
                  <option value="rider">Rider</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={isCreatingAccount}
                className="self-end rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-amber-300 disabled:opacity-50"
              >
                {isCreatingAccount ? 'Creating…' : '+ Create Account'}
              </button>
            </form>

            {accountMessage && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">{accountMessage}</p>}
            {accountError && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200" role="alert">{accountError}</p>}

            {/* Suspension Form Modal/Card */}
            {suspensionTarget && (
              <form onSubmit={(e) => void updateAccountSuspension(e)} className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                <div>
                  <h4 className="font-bold text-red-900 text-sm">Suspend {suspensionTarget.role} Account</h4>
                  <p className="text-xs text-red-700">{suspensionTarget.phone} will have active sessions revoked.</p>
                </div>
                <label className="block text-xs font-bold text-slate-700">
                  Suspension Reason (Required)
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    rows={2}
                    value={suspensionReason}
                    onChange={(e) => setSuspensionReason(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-xs"
                    placeholder="Enter reason for account suspension..."
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSuspensionTarget(null);
                      setSuspensionReason('');
                    }}
                    disabled={isUpdatingSuspension}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingSuspension || suspensionReason.trim().length < 5}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isUpdatingSuspension ? 'Suspending…' : 'Confirm Suspension'}
                  </button>
                </div>
              </form>
            )}

            {/* Account Search & Filter */}
            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <input
                type="search"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void loadAccounts(1, accountSearch, accountRole);
                  }
                }}
                placeholder="Search by phone number..."
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <select
                value={accountRole}
                onChange={(e) => {
                  const role = e.target.value as 'all' | 'passenger' | 'rider';
                  setAccountRole(role);
                  void loadAccounts(1, accountSearch, role);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              >
                <option value="all">All Roles</option>
                <option value="passenger">Passengers</option>
                <option value="rider">Riders</option>
              </select>
              <button
                type="button"
                onClick={() => void loadAccounts(1, accountSearch, accountRole)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Search
              </button>
            </div>

            {/* Accounts Table */}
            {accounts && accounts.data.length > 0 ? (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                      <tr>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Access</th>
                        <th className="py-2.5 px-3">Action</th>
                        <th className="py-2.5 px-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {accounts.data.map((acc) => (
                        <tr key={acc.id} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{acc.phone}</td>
                          <td className="py-2.5 px-3 capitalize">{acc.role}</td>
                          <td className="py-2.5 px-3 capitalize">{acc.status}</td>
                          <td className="py-2.5 px-3">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${acc.is_suspended ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                              {acc.is_suspended ? 'Suspended' : 'Active'}
                            </span>
                            {acc.is_suspended && acc.suspension_reason && (
                              <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{acc.suspension_reason}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              disabled={isUpdatingSuspension}
                              onClick={() => {
                                if (acc.is_suspended) void restoreAccount(acc);
                                else {
                                  setAccountError(null);
                                  setSuspensionReason('');
                                  setSuspensionTarget(acc);
                                }
                              }}
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${
                                acc.is_suspended ? 'border border-emerald-300 text-emerald-800 hover:bg-emerald-50' : 'border border-red-200 text-red-700 hover:bg-red-50'
                              }`}
                            >
                              {acc.is_suspended ? 'Restore' : 'Suspend'}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{new Date(acc.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{accounts.total.toLocaleString()} accounts total · Page {accounts.current_page} of {accounts.last_page}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void loadAccounts(accountPage - 1, accountSearch, accountRole)}
                      disabled={accountPage <= 1}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadAccounts(accountPage + 1, accountSearch, accountRole)}
                      disabled={accountPage >= accounts.last_page}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            ) : accounts ? (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">No matching accounts found.</p>
            ) : null}
          </section>
        )}

        {activeSection === 'recent-trips' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900">Recent Trip History</h3>
            {recentTrips.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[600px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3">Trip ID</th>
                      <th className="py-2.5 px-3">Route</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Fare</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentTrips.map((trip) => (
                      <tr key={trip.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">#{trip.id}</td>
                        <td className="py-2.5 px-3 max-w-xs truncate font-medium">
                          {trip.pickup_location || 'Pickup'} → {trip.destination_location || 'Destination'}
                        </td>
                        <td className="py-2.5 px-3 capitalize">
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            trip.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : trip.status === 'cancelled'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-800'
                          }`}>
                            {trip.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">₵{Number(trip.estimated_fare).toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-slate-400">{new Date(trip.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-slate-500">{isLoading ? 'Loading recent trips…' : 'No trips recorded yet.'}</p>
            )}
          </section>
        )}

        {/* 4. GOVERNANCE SECTIONS */}
        {activeSection === 'reports' && <Reports />}
        {activeSection === 'audit-log' && <AuditLog />}
        {activeSection === 'staff-access' && <StaffAccess currentUserId={user?.id ?? 0} />}
      </main>
    </div>
  );
};

export default AdminDashboard;
