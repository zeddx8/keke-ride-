import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import axios from 'axios';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import AccountAvatar from './AccountAvatar';

interface SettingsMenuProps {
  role: 'passenger' | 'rider';
  standalone?: boolean;
}

interface AccountSettings {
  push_notifications_enabled: boolean;
  preferred_language: string;
  shift_started_at: string | null;
  shift_seconds_total: number;
  shift_break_started_at: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  wallet_balance?: number;
  payment_method?: 'cash' | 'wallet' | 'mobile_money';
  trusted_contact_name?: string | null;
  trusted_contact_phone?: string | null;
  hide_exact_location: boolean;
  emergency_alerts_enabled: boolean;
  default_service_type: 'ride' | 'delivery';
  quiet_ride: boolean;
  extra_luggage: boolean;
  receipt_channel: 'none' | 'email' | 'sms';
  automatic_rating_prompt: boolean;
  rider_request_radius_km: number;
  destination_requests_enabled: boolean;
  preferred_areas: string | null;
  navigation_app: 'google_maps' | 'waze' | 'in_app';
  break_reminders_enabled: boolean;
  alertness_prompts_enabled: boolean;
  earnings_summary_period: 'daily' | 'weekly' | 'monthly';
  withdrawal_account: string | null;
}

type PassengerPanel =
  | 'menu'
  | 'profile'
  | 'wallet'
  | 'history'
  | 'favorites'
  | 'payment'
  | 'about'
  | 'deliveries'
  | 'help'
  | 'lost'
  | 'safety'
  | 'preferences'
  | 'app_settings';

type RiderPanel =
  | 'menu'
  | 'shift'
  | 'earnings'
  | 'vehicle'
  | 'preferences'
  | 'profile'
  | 'incidents'
  | 'app_settings';

const riderPanelTitles: Record<RiderPanel, string> = {
  menu: 'Driver Partner Dashboard',
  shift: 'Shift & Duty Controls',
  earnings: 'Earnings & Payouts',
  vehicle: 'Vehicle & Documents',
  preferences: 'Radar & Online Preferences',
  profile: 'Driver Profile & Verification',
  incidents: 'Safety & Incident History',
  app_settings: 'App & System Preferences',
};

interface WalletTransaction {
  id: number;
  type: 'topup' | 'ride' | 'refund';
  amount: number;
  description: string;
  created_at: string;
}

interface RecentTripItem {
  id: number;
  pickup_location: string | null;
  destination_location: string | null;
  estimated_fare: number;
  status: string;
  created_at: string;
  payment_method: string;
}

const documentExpiryWarning = (value: string) => {
  if (!value) return '';
  const days = Math.ceil((new Date(`${value}T00:00:00`).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Expired';
  if (days <= 30) return `Expires in ${days} day${days === 1 ? '' : 's'}`;
  return '';
};

const SettingsMenu = ({ role, standalone = false }: SettingsMenuProps) => {
  const { logout, user, updateAvatar } = useAuth();
  const [open, setOpen] = useState(false);
  const [passengerPanel, setPassengerPanel] = useState<PassengerPanel>('menu');
  const [riderPanel, setRiderPanel] = useState<RiderPanel>('menu');
  const [favoritePlaces, setFavoritePlaces] = useState<Array<{ id: number; name: string; label: string }>>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [walletAmount, setWalletAmount] = useState('');
  const [recentTrips, setRecentTrips] = useState<RecentTripItem[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [favoriteName, setFavoriteName] = useState('Home');
  const [favoriteLabel, setFavoriteLabel] = useState('');
  const [trustedContact, setTrustedContact] = useState({ name: '', phone: '' });
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [profile, setProfile] = useState({
    first_name: '',
    last_name: '',
    phone: user?.phone || '',
    email: '',
  });
  const [settings, setSettings] = useState<AccountSettings>({
    push_notifications_enabled: true,
    preferred_language: 'en',
    shift_started_at: null,
    shift_seconds_total: 0,
    shift_break_started_at: null,
    wallet_balance: 0,
    payment_method: 'cash',
    hide_exact_location: false,
    emergency_alerts_enabled: true,
    default_service_type: 'ride',
    quiet_ride: false,
    extra_luggage: false,
    receipt_channel: 'none',
    automatic_rating_prompt: true,
    rider_request_radius_km: 10,
    destination_requests_enabled: false,
    preferred_areas: '',
    navigation_app: 'google_maps',
    break_reminders_enabled: true,
    alertness_prompts_enabled: true,
    earnings_summary_period: 'weekly',
    withdrawal_account: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deletingHistory, setDeletingHistory] = useState(false);
  const selfieRef = useRef<HTMLInputElement>(null);
  const [riderVehicle, setRiderVehicle] = useState({
    vehicle_make: '',
    vehicle_model: '',
    vehicle_color: '',
    license_expiry: '',
    insurance_expiry: '',
    vehicle_papers_expiry: '',
    roadworthy_expiry: '',
  });
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [incidents, setIncidents] = useState<Array<{ id: number; category: string; summary: string; status: string; created_at: string }>>([]);

  useEffect(() => {
    if (!open && !standalone) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    apiClient
      .get<{ settings: AccountSettings }>('/settings')
      .then(({ data }) => {
        setSettings(data.settings);
        setTrustedContact({
          name: data.settings.trusted_contact_name || '',
          phone: data.settings.trusted_contact_phone || '',
        });
        const trustedName = data.settings.trusted_contact_name || '';
        const trustedPhone = data.settings.trusted_contact_phone || '';
        if (trustedName) localStorage.setItem(`trusted_contact_name_${user?.id || ''}`, trustedName);
        else localStorage.removeItem(`trusted_contact_name_${user?.id || ''}`);
        if (trustedPhone) localStorage.setItem(`trusted_contact_phone_${user?.id || ''}`, trustedPhone);
        else localStorage.removeItem(`trusted_contact_phone_${user?.id || ''}`);
        setProfile({
          first_name: data.settings.first_name || '',
          last_name: data.settings.last_name || '',
          phone: user?.phone || '',
          email: data.settings.email || '',
        });
      })
      .catch(() => setError('Could not load account settings.'));

    if (role === 'rider') {
      apiClient
        .get<{ profile: typeof riderVehicle }>('/rider/profile')
        .then(({ data }) =>
          setRiderVehicle({
            vehicle_make: data.profile.vehicle_make || '',
            vehicle_model: data.profile.vehicle_model || '',
            vehicle_color: data.profile.vehicle_color || '',
            license_expiry: data.profile.license_expiry || '',
            insurance_expiry: data.profile.insurance_expiry || '',
            vehicle_papers_expiry: data.profile.vehicle_papers_expiry || '',
            roadworthy_expiry: data.profile.roadworthy_expiry || '',
          }),
        )
        .catch(() => undefined);
      apiClient
        .get<{ incidents: typeof incidents }>('/rider/incidents')
        .then(({ data }) => setIncidents(data.incidents))
        .catch(() => undefined);
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (standalone) {
          if (window.history.state?.accountView) window.history.back();
          else {
            window.history.replaceState({}, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        } else setOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, standalone, role, user?.id, user?.phone]);

  const saveSetting = async (patch: Partial<AccountSettings>) => {
    setError('');
    setMessage('');
    try {
      const { data } = await apiClient.patch<{ settings: AccountSettings }>('/settings', patch);
      setSettings(data.settings);
      setMessage('Settings updated.');
    } catch (requestError: unknown) {
      const response = axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data?.message
        : undefined;
      setError(response || 'Could not save the setting.');
    }
  };

  const toggleNotifications = async () => {
    const next = !settings.push_notifications_enabled;
    if (next && 'Notification' in window && Notification.permission !== 'granted') {
      try {
        await Notification.requestPermission();
      } catch {
        setError('Browser notification permission was not granted.');
        return;
      }
    }
    await saveSetting({ push_notifications_enabled: next });
  };

  const loadRecentTrips = async () => {
    setLoadingTrips(true);
    try {
      const { data } = await apiClient.get<{ data: RecentTripItem[] }>('/trips/history?page=1');
      setRecentTrips(data.data || []);
    } catch {
      // non-fatal
    } finally {
      setLoadingTrips(false);
    }
  };

  const deleteHistory = async () => {
    if (!window.confirm('Delete your ride history? This cannot be undone.')) return;
    setDeletingHistory(true);
    try {
      await apiClient.delete('/trips/history');
      setRecentTrips([]);
      setMessage('Ride history deleted.');
    } catch {
      setError('Could not delete ride history.');
    } finally {
      setDeletingHistory(false);
    }
  };

  const uploadSelfie = async (event: ChangeEvent<HTMLInputElement>) => {
    const selfie = event.target.files?.[0];
    if (!selfie) return;
    const form = new FormData();
    form.append('selfie', selfie);
    try {
      await apiClient.post('/rider/selfie', form);
      setMessage('Identity selfie uploaded for periodic verification.');
    } catch (requestError: unknown) {
      const response = axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data?.message
        : undefined;
      setError(response || 'Could not upload your selfie.');
    } finally {
      event.target.value = '';
    }
  };

  const updateShift = async (action: 'start' | 'stop' | 'break') => {
    try {
      const { data } = await apiClient.post<{ settings: AccountSettings }>('/rider/shift', { action });
      setSettings(data.settings);
      setMessage(action === 'start' ? 'Shift started.' : action === 'stop' ? 'Shift ended.' : 'Break status updated.');
    } catch {
      setError('Could not update your shift.');
    }
  };

  const openPassengerPanel = async (panel: PassengerPanel) => {
    setPassengerPanel(panel);
    setMessage('');
    setError('');
    if (panel === 'favorites') {
      try {
        const { data } = await apiClient.get<{ saved_places: Array<{ id: number; name: string; label: string }> }>('/passenger/saved-places');
        setFavoritePlaces(data.saved_places);
      } catch {
        setError('Could not load favorites.');
      }
    }
    if (panel === 'wallet') {
      try {
        const { data } = await apiClient.get<{ balance: number; transactions: WalletTransaction[] }>('/passenger/wallet');
        setSettings((current) => ({ ...current, wallet_balance: data.balance }));
        setWalletTransactions(data.transactions);
      } catch {
        setError('Could not load wallet information.');
      }
    }
    if (panel === 'history') {
      void loadRecentTrips();
    }
  };

  const saveProfile = async () => {
    setError('');
    setMessage('');
    try {
      // NOTE: Phone is not editable directly; only name & email are patched.
      const { data } = await apiClient.patch<{ settings: AccountSettings }>('/settings', {
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
        email: profile.email.trim() || null,
      });
      setSettings(data.settings);
      setMessage('Profile updated successfully.');
    } catch (requestError: unknown) {
      const response = axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data?.message
        : undefined;
      setError(response || 'Could not update profile.');
    }
  };

  const saveTrustedContact = async () => {
    const phone = trustedContact.phone.trim();
    const name = trustedContact.name.trim();
    if (phone && !/^[+0-9().\-\s]{7,24}$/.test(phone)) {
      setError('Enter a valid trusted-contact phone number.');
      return;
    }
    await saveSetting({
      trusted_contact_name: name || null,
      trusted_contact_phone: phone || null,
    });
    if (user?.id) {
      if (name) localStorage.setItem(`trusted_contact_name_${user.id}`, name);
      else localStorage.removeItem(`trusted_contact_name_${user.id}`);
      if (phone) localStorage.setItem(`trusted_contact_phone_${user.id}`, phone);
      else localStorage.removeItem(`trusted_contact_phone_${user.id}`);
    }
  };

  const addWalletMoney = async () => {
    const amount = Number(walletAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid top-up amount.');
      return;
    }
    try {
      const { data } = await apiClient.post<{ balance: number; transactions: WalletTransaction[] }>('/passenger/wallet/topup', { amount });
      setSettings((current) => ({ ...current, wallet_balance: data.balance }));
      setWalletTransactions(data.transactions);
      setWalletAmount('');
      setMessage(`Successfully added ₵${amount.toFixed(2)} to your wallet.`);
    } catch (requestError: unknown) {
      const response = axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data?.message
        : undefined;
      setError(response || 'Could not top up wallet.');
    }
  };

  const addFavoritePlace = async () => {
    const label = favoriteLabel.trim();
    if (!label) {
      setError('Enter a label or address for the place.');
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      async ({ coords }) => {
        try {
          const { data } = await apiClient.post<{ saved_place: { id: number; name: string; label: string } }>('/passenger/saved-places', {
            name: favoriteName.trim() || 'Custom',
            label,
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          setFavoritePlaces((current) => [...current, data.saved_place]);
          setFavoriteLabel('');
          setMessage('Favorite place saved.');
        } catch (requestError: unknown) {
          const response = axios.isAxiosError<{ message?: string }>(requestError)
            ? requestError.response?.data?.message
            : undefined;
          setError(response || 'Could not save favorite place.');
        }
      },
      () => setError('Location access is required to add a saved place.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submitSupport = async (subjectOverride?: string) => {
    const subject = (subjectOverride || supportSubject).trim();
    if (!subject || !supportMessage.trim()) {
      setError('Enter both a subject and message.');
      return;
    }
    setSubmittingSupport(true);
    try {
      await apiClient.post('/passenger/support', {
        subject,
        message: supportMessage.trim(),
      });
      setSupportSubject('');
      setSupportMessage('');
      setMessage('Support request submitted. Our team will review it promptly.');
    } catch {
      setError('Could not submit support request.');
    } finally {
      setSubmittingSupport(false);
    }
  };

  const saveVehicle = async () => {
    setSavingVehicle(true);
    try {
      await apiClient.patch('/rider/vehicle', riderVehicle);
      setMessage('Vehicle and document details saved.');
    } catch (requestError: unknown) {
      const response = axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data?.message
        : undefined;
      setError(response || 'Could not save vehicle details.');
    } finally {
      setSavingVehicle(false);
    }
  };

  const shiftHoursFormatted = (() => {
    let totalSec = settings.shift_seconds_total || 0;
    if (settings.shift_started_at && !settings.shift_break_started_at) {
      const startMs = new Date(settings.shift_started_at).getTime();
      if (!Number.isNaN(startMs)) {
        totalSec += Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      }
    }
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    return `${hrs}h ${mins}m`;
  })();

  const exportPersonalData = async () => {
    try {
      const { data } = await apiClient.get('/account/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'keke-ride-personal-data.json';
      link.click();
      URL.revokeObjectURL(url);
      setMessage('Personal data downloaded.');
    } catch {
      setError('Could not export personal data.');
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Delete your Keke Ride account permanently? This cannot be undone.')) return;
    setDeletingAccount(true);
    try {
      await apiClient.delete('/account');
      await logout();
    } catch {
      setError('Could not delete account.');
      setDeletingAccount(false);
    }
  };

  const shiftActive = Boolean(settings.shift_started_at);
  const shiftOnBreak = Boolean(settings.shift_break_started_at);

  const closeAccount = () => {
    setPassengerPanel('menu');
    setRiderPanel('menu');
    setMessage('');
    setError('');
    if (standalone) {
      if (window.history.state?.accountView) {
        window.history.back();
      } else {
        window.history.replaceState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      return;
    }
    setOpen(false);
  };

  const displayName =
    profile.first_name || profile.last_name
      ? `${profile.first_name} ${profile.last_name}`.trim()
      : user?.name || 'Passenger';

  const panelTitles: Record<PassengerPanel, string> = {
    menu: 'Account',
    profile: 'Personal Profile',
    wallet: 'Keke Wallet',
    history: 'Ride History',
    favorites: 'Saved Places',
    payment: 'Payment Methods',
    about: 'About Keke Ride',
    deliveries: 'Package Deliveries',
    help: 'Help & Support',
    lost: 'Report Lost Item',
    safety: 'Safety Center',
    preferences: 'Ride Preferences',
    app_settings: 'App Settings',
  };

  return (
    <>
      {!standalone && (
        <button
          type="button"
          onClick={() => {
            window.history.pushState({ accountView: true }, '', `/account/${role}`);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="settings-trigger flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:bg-slate-50"
          aria-haspopup="dialog"
          aria-label="Open settings menu"
          title="Settings menu"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {(open || standalone) && (
        <div
          className="settings-backdrop settings-account-page fixed inset-0 z-[3000] flex justify-center bg-slate-900/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${role} settings menu`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAccount();
          }}
        >
          <aside className="settings-drawer w-full max-w-lg min-h-screen bg-slate-50 flex flex-col shadow-2xl overflow-y-auto" role="document">
            {/* Top Navigation Header */}
            <div className="settings-drawer-header sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-md px-5 py-3.5 shadow-sm">
              <div className="flex items-center gap-3">
                {(role === 'passenger' ? passengerPanel !== 'menu' : riderPanel !== 'menu') ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (role === 'passenger') {
                        setPassengerPanel('menu');
                      } else {
                        setRiderPanel('menu');
                      }
                      setMessage('');
                      setError('');
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 active:scale-95"
                    aria-label="Back to Menu"
                    title="Back to Menu"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={closeAccount}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 active:scale-95"
                    aria-label="Close"
                    title="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700">
                    {role === 'passenger' ? 'Passenger Portal' : 'Driver Partner'}
                  </p>
                  <h2 className="text-lg font-bold text-slate-900 leading-tight">
                    {role === 'passenger' ? panelTitles[passengerPanel] : riderPanelTitles[riderPanel]}
                  </h2>
                </div>
              </div>

              {(role === 'passenger' ? passengerPanel !== 'menu' : riderPanel !== 'menu') && (
                <button
                  type="button"
                  onClick={closeAccount}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                  aria-label="Close settings"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Notification Toasts */}
            <div className="px-5 pt-3">
              {message && (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-sm text-emerald-800" role="status">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>{message}</span>
                  </div>
                  <button type="button" onClick={() => setMessage('')} className="text-emerald-600 hover:text-emerald-900 font-bold ml-2">×</button>
                </div>
              )}
              {error && (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700" role="alert">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{error}</span>
                  </div>
                  <button type="button" onClick={() => setError('')} className="text-red-600 hover:text-red-900 font-bold ml-2">×</button>
                </div>
              )}
            </div>

            {/* Main Content Area */}
            <div className="settings-drawer-content flex-1 space-y-4 p-5 pt-1">
              {role === 'passenger' ? (
                <>
                  {/* PASSENGER MAIN DASHBOARD VIEW */}
                  {passengerPanel === 'menu' && (
                    <div className="space-y-4">
                      {/* Hero Profile Card */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3.5">
                            <AccountAvatar
                              name={displayName}
                              phone={user?.phone || profile.phone}
                              avatarUrl={user?.avatar_url}
                              onChanged={(newUrl) => updateAvatar(newUrl)}
                              passenger
                            />
                            <div>
                              <h3 className="font-bold text-slate-900 text-base leading-tight">{displayName}</h3>
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="font-mono text-xs text-slate-500">{user?.phone || profile.phone}</span>
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                  ✓ Verified
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('profile')}
                            className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                          >
                            Edit
                          </button>
                        </div>

                        {/* Quick Wallet Summary Card */}
                        <div className="mt-4 rounded-xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-4 text-white shadow-md">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Keke Wallet Balance</p>
                              <p className="mt-1 text-2xl font-black tracking-tight">₵{Number(settings.wallet_balance || 0).toFixed(2)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void openPassengerPanel('wallet')}
                              className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 shadow transition hover:bg-amber-300 active:scale-95"
                            >
                              + Top Up
                            </button>
                          </div>
                          <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              Payment: <strong className="capitalize text-white">{settings.payment_method === 'mobile_money' ? 'MoMo' : settings.payment_method}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => void openPassengerPanel('payment')}
                              className="text-amber-300 hover:underline"
                            >
                              Change →
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* SECTION 1: Rides & Payments */}
                      <div>
                        <p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Rides & Payments</p>
                        <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('wallet')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-900 font-bold group-hover:bg-amber-200 transition">
                                ₵
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Wallet & Top Up</p>
                                <p className="text-xs text-slate-500">₵{Number(settings.wallet_balance || 0).toFixed(2)} · Instant top-up & transactions</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('payment')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <rect x="2" y="5" width="20" height="14" rx="2" />
                                  <line x1="2" y1="10" x2="22" y2="10" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Payment Method</p>
                                <p className="text-xs text-slate-500">Default: <span className="capitalize font-semibold text-slate-700">{settings.payment_method === 'mobile_money' ? 'Mobile Money' : settings.payment_method}</span></p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('history')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Ride History</p>
                                <p className="text-xs text-slate-500">Past trips, routes and receipts</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('favorites')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Saved Places</p>
                                <p className="text-xs text-slate-500">Home, Work and frequent destinations</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('deliveries')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Package Deliveries</p>
                                <p className="text-xs text-slate-500">Send packages with trusted keke riders</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>
                        </div>
                      </div>

                      {/* SECTION 2: Safety & Ride Preferences */}
                      <div>
                        <p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Safety & Preferences</p>
                        <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('safety')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Safety Center</p>
                                <p className="text-xs text-slate-500">
                                  {trustedContact.name ? `Trusted contact: ${trustedContact.name}` : 'Set trusted contacts & trip privacy'}
                                </p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('preferences')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Ride Preferences</p>
                                <p className="text-xs text-slate-500">Quiet ride, luggage, receipts & booking mode</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>
                        </div>
                      </div>

                      {/* SECTION 3: Account & App Settings */}
                      <div>
                        <p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Account & App</p>
                        <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('profile')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Personal Profile</p>
                                <p className="text-xs text-slate-500">Name, email & verified mobile number</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('app_settings')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">App Settings</p>
                                <p className="text-xs text-slate-500">Notifications, language ({settings.preferred_language.toUpperCase()}) & data</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>
                        </div>
                      </div>

                      {/* SECTION 4: Support & Info */}
                      <div>
                        <p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Support & Info</p>
                        <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('help')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Help & Support</p>
                                <p className="text-xs text-slate-500">Trip assistance & in-app support tickets</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('lost')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">Report Lost Item</p>
                                <p className="text-xs text-slate-500">File a report for items left in a tricycle</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void openPassengerPanel('about')}
                            className="group flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">About Keke Ride</p>
                                <p className="text-xs text-slate-500">Version 1.3.1 · Terms & Privacy</p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-700 transition">›</span>
                          </button>
                        </div>
                      </div>

                      {/* Sign Out Action */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => void logout()}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-red-600 shadow-sm transition hover:bg-red-50 hover:border-red-200 active:scale-98"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Sign out of Keke Ride
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: PROFILE */}
                  {passengerPanel === 'profile' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                          <AccountAvatar
                            name={displayName}
                            phone={user?.phone || profile.phone}
                            avatarUrl={user?.avatar_url}
                            onChanged={(newUrl) => updateAvatar(newUrl)}
                            passenger
                          />
                          <div>
                            <p className="font-bold text-slate-900">{displayName}</p>
                            <p className="text-xs text-slate-500">Tap avatar photo to update image</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block text-xs font-bold text-slate-700">
                            First Name
                            <input
                              value={profile.first_name}
                              onChange={(e) => setProfile((current) => ({ ...current, first_name: e.target.value }))}
                              placeholder="First name"
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-amber-500"
                            />
                          </label>
                          <label className="block text-xs font-bold text-slate-700">
                            Last Name
                            <input
                              value={profile.last_name}
                              onChange={(e) => setProfile((current) => ({ ...current, last_name: e.target.value }))}
                              placeholder="Last name"
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-amber-500"
                            />
                          </label>
                        </div>

                        {/* Verified Mobile Number (Locked / Read-Only Display) */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Mobile Number</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                              ✓ Verified
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                            {user?.phone || profile.phone}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Tied to your SMS OTP verification. Contact support if you need to transfer phone numbers.
                          </p>
                        </div>

                        <label className="block text-xs font-bold text-slate-700">
                          Email Address
                          <input
                            type="email"
                            value={profile.email}
                            onChange={(e) => setProfile((current) => ({ ...current, email: e.target.value }))}
                            placeholder="rider@example.com"
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-amber-500"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => void saveProfile()}
                          className="w-full rounded-xl bg-amber-400 py-3 text-sm font-bold text-slate-950 shadow transition hover:bg-amber-300 active:scale-98"
                        >
                          Save Profile Changes
                        </button>
                      </div>

                      {/* Danger Zone */}
                      <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
                        <h4 className="font-bold text-red-900 text-sm">Account Deletion</h4>
                        <p className="mt-1 text-xs text-red-700">
                          Permanently delete your Keke Ride passenger profile, trip history, and saved data.
                        </p>
                        <button
                          type="button"
                          onClick={() => void deleteAccount()}
                          disabled={deletingAccount}
                          className="mt-3 w-full rounded-xl border border-red-300 bg-white py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          {deletingAccount ? 'Deleting account...' : 'Delete Account Permanently'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: WALLET */}
                  {passengerPanel === 'wallet' && (
                    <div className="space-y-4">
                      {/* Big Wallet Card */}
                      <div className="rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white shadow-lg">
                        <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Available Balance</p>
                        <p className="mt-2 text-4xl font-black">₵{Number(settings.wallet_balance || 0).toFixed(2)}</p>
                        <p className="mt-2 text-xs text-slate-300">Usable for instant, cashless rides and parcel deliveries</p>
                      </div>

                      {/* Top Up Form */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-bold text-slate-900 text-base">Top Up Balance</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Select an amount or enter custom GHS</p>

                        <div className="mt-3 grid grid-cols-4 gap-2">
                          {[10, 20, 50, 100].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setWalletAmount(String(amt))}
                              className={`rounded-xl border py-2.5 text-sm font-bold transition ${
                                walletAmount === String(amt)
                                  ? 'border-amber-500 bg-amber-400 text-slate-950 shadow-sm'
                                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                              }`}
                            >
                              ₵{amt}
                            </button>
                          ))}
                        </div>

                        <div className="mt-3">
                          <label className="block text-xs font-bold text-slate-700">
                            Custom Amount (GHS)
                            <input
                              type="number"
                              min="1"
                              max="500"
                              value={walletAmount}
                              onChange={(e) => setWalletAmount(e.target.value)}
                              placeholder="Enter amount (e.g. 25)"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                            />
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={() => void addWalletMoney()}
                          className="mt-4 w-full rounded-xl bg-amber-400 py-3 text-sm font-bold text-slate-950 shadow transition hover:bg-amber-300 active:scale-98"
                        >
                          + Add Money to Wallet
                        </button>
                      </div>

                      {/* Transaction History */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="font-bold text-slate-900 text-sm">Recent Transactions</h3>
                        {walletTransactions.length === 0 ? (
                          <p className="mt-3 text-center py-6 text-xs text-slate-400">No transactions recorded yet.</p>
                        ) : (
                          <div className="mt-2 divide-y divide-slate-100">
                            {walletTransactions.map((tx) => (
                              <div key={tx.id} className="flex items-center justify-between py-2.5">
                                <div>
                                  <p className="text-xs font-bold text-slate-900">{tx.description || 'Wallet Transaction'}</p>
                                  <p className="text-[11px] text-slate-400">{new Date(tx.created_at).toLocaleDateString()}</p>
                                </div>
                                <span className={`text-sm font-bold ${tx.type === 'topup' || tx.type === 'refund' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                  {tx.type === 'topup' || tx.type === 'refund' ? '+' : '-'}₵{Number(tx.amount).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: PAYMENT METHOD */}
                  {passengerPanel === 'payment' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="font-bold text-slate-900 text-base">Select Payment Method</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Choose your preferred payment method for upcoming rides.</p>

                        <div className="mt-4 space-y-2.5">
                          {(
                            [
                              {
                                id: 'cash',
                                title: 'Cash Payment',
                                description: 'Pay the driver directly at the end of the trip.',
                                badge: 'Universal',
                              },
                              {
                                id: 'wallet',
                                title: 'Keke Wallet',
                                description: `Current balance: ₵${Number(settings.wallet_balance || 0).toFixed(2)}. Instant, automatic payment.`,
                                badge: 'Cashless',
                              },
                              {
                                id: 'mobile_money',
                                title: 'Mobile Money (MTN / Telecel / AT)',
                                description: 'Pay using your mobile money prompt directly.',
                                badge: 'MoMo',
                              },
                            ] as const
                          ).map((method) => {
                            const isSelected = settings.payment_method === method.id;
                            return (
                              <button
                                key={method.id}
                                type="button"
                                onClick={() => void saveSetting({ payment_method: method.id })}
                                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
                                  isSelected
                                    ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <div className="pr-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-slate-900">{method.title}</span>
                                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{method.badge}</span>
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">{method.description}</p>
                                </div>
                                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                  isSelected ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300'
                                }`}>
                                  {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: RIDE HISTORY */}
                  {passengerPanel === 'history' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-slate-900 text-base">Ride History</h3>
                            <p className="text-xs text-slate-500">Your recent keke trips</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void loadRecentTrips()}
                            className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Refresh
                          </button>
                        </div>

                        {loadingTrips ? (
                          <div className="py-8 text-center text-xs text-slate-400">Loading trips...</div>
                        ) : recentTrips.length === 0 ? (
                          <div className="py-8 text-center">
                            <p className="text-sm font-semibold text-slate-700">No ride records found</p>
                            <p className="mt-1 text-xs text-slate-400">Completed rides will appear here with fare receipts.</p>
                          </div>
                        ) : (
                          <div className="mt-3 divide-y divide-slate-100">
                            {recentTrips.map((trip) => (
                              <div key={trip.id} className="py-3">
                                <div className="flex items-center justify-between">
                                  <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                    trip.status === 'completed'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : trip.status === 'cancelled'
                                        ? 'bg-red-50 text-red-700 border border-red-200'
                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                  }`}>
                                    {trip.status}
                                  </span>
                                  <span className="font-bold text-sm text-slate-900">₵{Number(trip.estimated_fare).toFixed(2)}</span>
                                </div>
                                <div className="mt-2 space-y-1 text-xs">
                                  <p className="text-slate-600 truncate"><strong className="text-slate-900">From:</strong> {trip.pickup_location || 'Pickup'}</p>
                                  <p className="text-slate-600 truncate"><strong className="text-slate-900">To:</strong> {trip.destination_location || 'Destination'}</p>
                                </div>
                                <p className="mt-1.5 text-[10px] text-slate-400">
                                  {new Date(trip.created_at).toLocaleString()} · Paid via {trip.payment_method}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Clear History Button */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h4 className="font-bold text-slate-800 text-sm">Clear History</h4>
                        <p className="mt-1 text-xs text-slate-500">Remove past trip logs from your account view.</p>
                        <button
                          type="button"
                          onClick={() => void deleteHistory()}
                          disabled={deletingHistory}
                          className="mt-3 w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                        >
                          {deletingHistory ? 'Deleting...' : 'Delete Ride History'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: SAVED PLACES */}
                  {passengerPanel === 'favorites' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="font-bold text-slate-900 text-base">Favorite Places</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Fast one-tap destinations when requesting rides.</p>

                        {favoritePlaces.length === 0 ? (
                          <div className="my-6 text-center">
                            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 text-xl font-bold">★</span>
                            <p className="mt-2 text-sm font-semibold text-slate-700">No saved places yet</p>
                            <p className="text-xs text-slate-400">Add Home, Work, or frequent locations below.</p>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {favoritePlaces.map((place) => (
                              <div key={place.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                                <div className="flex items-center gap-3">
                                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800 text-xs font-bold">
                                    {place.name.slice(0, 1)}
                                  </span>
                                  <div>
                                    <p className="text-xs font-bold text-slate-900">{place.name}</p>
                                    <p className="text-[11px] text-slate-500">{place.label}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 border-t border-slate-100 pt-4 space-y-2.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Add New Place</h4>
                          <div className="grid grid-cols-3 gap-2">
                            <select
                              value={favoriteName}
                              onChange={(e) => setFavoriteName(e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800"
                            >
                              <option value="Home">Home</option>
                              <option value="Work">Work</option>
                              <option value="School">School</option>
                              <option value="Market">Market</option>
                              <option value="Custom">Custom</option>
                            </select>
                            <input
                              value={favoriteLabel}
                              onChange={(e) => setFavoriteLabel(e.target.value)}
                              placeholder="Address / Area name"
                              className="col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => void addFavoritePlace()}
                            className="w-full rounded-xl bg-amber-400 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300"
                          >
                            + Save Current Location as Favorite
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: DELIVERIES */}
                  {passengerPanel === 'deliveries' && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                      <h3 className="mt-4 font-bold text-slate-900 text-lg">Package Deliveries</h3>
                      <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
                        Send documents, goods, and parcels safely across town using verified keke drivers.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setPassengerPanel('preferences');
                          void saveSetting({ default_service_type: 'delivery' });
                        }}
                        className="mt-5 rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300"
                      >
                        Set Delivery as Default Service
                      </button>
                    </div>
                  )}

                  {/* SUB-PANEL: SAFETY CENTER */}
                  {passengerPanel === 'safety' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">Trusted Contact</h3>
                          <p className="text-xs text-slate-500">Your trusted contact can receive automated trip updates and emergency alerts.</p>
                        </div>

                        <div className="space-y-3">
                          <label className="block text-xs font-bold text-slate-700">
                            Contact Name
                            <input
                              value={trustedContact.name}
                              onChange={(e) => setTrustedContact((cur) => ({ ...cur, name: e.target.value }))}
                              placeholder="e.g. Sister, Spouse, Friend"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-amber-500"
                            />
                          </label>

                          <label className="block text-xs font-bold text-slate-700">
                            Contact Phone Number
                            <input
                              type="tel"
                              value={trustedContact.phone}
                              onChange={(e) => setTrustedContact((cur) => ({ ...cur, phone: e.target.value }))}
                              placeholder="+233..."
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-amber-500"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => void saveTrustedContact()}
                            className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800"
                          >
                            Save Trusted Contact
                          </button>
                        </div>

                        <div className="border-t border-slate-100 pt-4 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Trip Privacy & Alerts</h4>

                          <label className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-800">
                            <div>
                              <span>Emergency SMS Alerts</span>
                              <p className="text-[11px] font-normal text-slate-500">Notify your contact when SOS is triggered</p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={settings.emergency_alerts_enabled}
                              onClick={() => void saveSetting({ emergency_alerts_enabled: !settings.emergency_alerts_enabled })}
                              className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings.emergency_alerts_enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
                            >
                              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settings.emergency_alerts_enabled ? 'left-5' : 'left-0.5'}`} />
                            </button>
                          </label>

                          <label className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-800">
                            <div>
                              <span>Hide Exact Pickup in Shares</span>
                              <p className="text-[11px] font-normal text-slate-500">Obfuscate precise location coordinates for privacy</p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={settings.hide_exact_location}
                              onClick={() => void saveSetting({ hide_exact_location: !settings.hide_exact_location })}
                              className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings.hide_exact_location ? 'bg-emerald-600' : 'bg-slate-300'}`}
                            >
                              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settings.hide_exact_location ? 'left-5' : 'left-0.5'}`} />
                            </button>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: RIDE PREFERENCES */}
                  {passengerPanel === 'preferences' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                        <h3 className="font-bold text-slate-900 text-base">Booking Preferences</h3>

                        <label className="block text-xs font-bold text-slate-700">
                          Default Booking Service
                          <select
                            value={settings.default_service_type}
                            onChange={(e) => void saveSetting({ default_service_type: e.target.value as 'ride' | 'delivery' })}
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                          >
                            <option value="ride">Passenger Ride</option>
                            <option value="delivery">Package Delivery</option>
                          </select>
                        </label>

                        <label className="block text-xs font-bold text-slate-700">
                          Ride Receipts Channel
                          <select
                            value={settings.receipt_channel}
                            onChange={(e) => void saveSetting({ receipt_channel: e.target.value as 'none' | 'email' | 'sms' })}
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                          >
                            <option value="none">Do not send receipts</option>
                            <option value="email">Email receipts</option>
                            <option value="sms">SMS receipts</option>
                          </select>
                        </label>

                        <div className="border-t border-slate-100 pt-4 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">On-Trip Preferences</h4>

                          {(
                            [
                              ['quiet_ride', 'Quiet ride preference', 'Notify driver that you prefer a quiet trip'],
                              ['extra_luggage', 'Extra luggage assistance', 'Alert rider that you have larger baggage'],
                              ['automatic_rating_prompt', 'Automatic rating prompt', 'Show rider rating dialog right after ride completion'],
                            ] as const
                          ).map(([key, label, desc]) => (
                            <label key={key} className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-800">
                              <div>
                                <span>{label}</span>
                                <p className="text-[11px] font-normal text-slate-500">{desc}</p>
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={Boolean(settings[key])}
                                onClick={() => void saveSetting({ [key]: !settings[key] })}
                                className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings[key] ? 'bg-emerald-600' : 'bg-slate-300'}`}
                              >
                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settings[key] ? 'left-5' : 'left-0.5'}`} />
                              </button>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: APP SETTINGS */}
                  {passengerPanel === 'app_settings' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                        <h3 className="font-bold text-slate-900 text-base">App Settings</h3>

                        <label className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-800">
                          <div>
                            <span>Push Notifications</span>
                            <p className="text-[11px] font-normal text-slate-500">Trip arrivals, driver chat and promotions</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={settings.push_notifications_enabled}
                            onClick={() => void toggleNotifications()}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings.push_notifications_enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
                          >
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settings.push_notifications_enabled ? 'left-5' : 'left-0.5'}`} />
                          </button>
                        </label>

                        <label className="block text-xs font-bold text-slate-700">
                          App Language
                          <select
                            value={settings.preferred_language}
                            onChange={(e) => void saveSetting({ preferred_language: e.target.value })}
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                          >
                            <option value="en">English</option>
                            <option value="tw">Twi</option>
                            <option value="gau">Ga</option>
                          </select>
                        </label>

                        <div className="border-t border-slate-100 pt-4">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Privacy & Data</h4>
                          <p className="mt-1 text-xs text-slate-500">Export your trips and account information in JSON format.</p>
                          <button
                            type="button"
                            onClick={() => void exportPersonalData()}
                            className="mt-3 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 transition"
                          >
                            Download Personal Data
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: HELP & SUPPORT */}
                  {passengerPanel === 'help' && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">Help & Support</h3>
                        <p className="text-xs text-slate-500">Send an inquiry directly to the Keke Ride support team.</p>
                      </div>

                      <label className="block text-xs font-bold text-slate-700">
                        Subject
                        <input
                          value={supportSubject}
                          onChange={(e) => setSupportSubject(e.target.value)}
                          placeholder="e.g. Overcharge inquiry, Rider feedback"
                          maxLength={120}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-amber-500"
                        />
                      </label>

                      <label className="block text-xs font-bold text-slate-700">
                        Message Details
                        <textarea
                          value={supportMessage}
                          onChange={(e) => setSupportMessage(e.target.value)}
                          placeholder="Describe the issue or feedback in detail..."
                          maxLength={2000}
                          rows={5}
                          className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-amber-500"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => void submitSupport()}
                        disabled={submittingSupport}
                        className="w-full rounded-xl bg-amber-400 py-3 text-sm font-bold text-slate-950 shadow transition hover:bg-amber-300 disabled:opacity-60"
                      >
                        {submittingSupport ? 'Submitting...' : 'Submit Support Request'}
                      </button>
                    </div>
                  )}

                  {/* SUB-PANEL: REPORT LOST ITEM */}
                  {passengerPanel === 'lost' && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">Report Lost Item</h3>
                        <p className="text-xs text-slate-500">
                          Did you leave something in a keke? Provide details so we can connect you with your driver.
                        </p>
                      </div>

                      <label className="block text-xs font-bold text-slate-700">
                        Item Description & Trip Details
                        <textarea
                          value={supportMessage}
                          onChange={(e) => setSupportMessage(e.target.value)}
                          placeholder="Example: Black leather wallet left on the seat during trip from Cape Coast Castle to UCC around 2 PM..."
                          maxLength={2000}
                          rows={6}
                          className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-amber-500"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => void submitSupport('Lost item report')}
                        disabled={submittingSupport}
                        className="w-full rounded-xl bg-amber-400 py-3 text-sm font-bold text-slate-950 shadow transition hover:bg-amber-300 disabled:opacity-60"
                      >
                        {submittingSupport ? 'Submitting...' : 'Submit Lost Item Report'}
                      </button>
                    </div>
                  )}

                  {/* SUB-PANEL: ABOUT */}
                  {passengerPanel === 'about' && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-400 text-2xl font-black text-slate-950 shadow-md">
                        KR
                      </div>
                      <h3 className="mt-4 text-xl font-black text-slate-900">Keke Ride</h3>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">Cape Coast Tricycle Mobility</p>
                      <p className="mt-2 text-xs text-slate-400">Release v1.3.1 · Build 2026</p>

                      <div className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-100 text-left">
                        <a href="#terms" onClick={(e) => e.preventDefault()} className="block p-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          Terms of Service
                        </a>
                        <a href="#privacy" onClick={(e) => e.preventDefault()} className="block p-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          Privacy Policy
                        </a>
                        <a href="#licenses" onClick={(e) => e.preventDefault()} className="block p-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          Open Source Licenses
                        </a>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* RIDER SETTINGS */
                <>
                  {riderPanel === 'menu' && (
                    <div className="space-y-4">
                      {/* Driver Hero Card */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-4">
                          <AccountAvatar
                            name={user?.name || 'Driver Partner'}
                            phone={user?.phone || ''}
                            avatarUrl={user?.avatar_url}
                            onChanged={updateAvatar}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-extrabold text-slate-900 truncate text-base">{user?.name || 'Driver Partner'}</h3>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                Verified
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">{user?.phone || 'No phone set'}</p>
                            <div className="mt-2 flex items-center gap-2">
                              {shiftOnBreak ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                  On Break
                                </span>
                              ) : shiftActive ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  On Duty ({shiftHoursFormatted})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 border border-slate-200">
                                  Off Duty
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick Shift Actions Bar */}
                        <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => void updateShift(shiftActive ? 'stop' : 'start')}
                            className={`rounded-xl py-2.5 px-3 text-xs font-bold text-white transition active:scale-95 flex items-center justify-center gap-1.5 shadow-sm ${
                              shiftActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              {shiftActive ? (
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              )}
                            </svg>
                            <span>{shiftActive ? 'End Shift' : 'Go On Duty'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={!shiftActive}
                            onClick={() => void updateShift('break')}
                            className="rounded-xl bg-amber-400 py-2.5 px-3 text-xs font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-40 active:scale-95 flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{shiftOnBreak ? 'Resume Duty' : 'Take Break'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Operations Quick Overview Strip */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Radar Radius</p>
                          <p className="mt-0.5 text-sm font-extrabold text-slate-900">{settings.rider_request_radius_km} km</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Navigation</p>
                          <p className="mt-0.5 text-xs font-extrabold text-slate-900 capitalize truncate">
                            {settings.navigation_app === 'google_maps' ? 'Google Maps' : settings.navigation_app === 'waze' ? 'Waze' : 'In-App'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payout</p>
                          <p className="mt-0.5 text-xs font-extrabold text-slate-900 truncate font-mono">
                            {settings.withdrawal_account || 'Not configured'}
                          </p>
                        </div>
                      </div>

                      {/* Document Expiry Notice if applicable */}
                      {(['license_expiry', 'insurance_expiry', 'vehicle_papers_expiry', 'roadworthy_expiry'] as const).some(
                        (k) => documentExpiryWarning(riderVehicle[k])
                      ) && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5">
                          <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div>
                            <p className="text-xs font-bold text-amber-900">Document Renewal Attention</p>
                            <p className="text-[11px] text-amber-700 mt-0.5">One or more vehicle documents are expiring soon or expired.</p>
                            <button
                              type="button"
                              onClick={() => setRiderPanel('vehicle')}
                              className="mt-1.5 text-xs font-bold text-amber-800 underline hover:text-amber-900"
                            >
                              Review Documents →
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Driver Modules Grid */}
                      <div className="grid grid-cols-2 gap-2.5">
                        {/* 1. Shift & Duty */}
                        <button
                          type="button"
                          onClick={() => setRiderPanel('shift')}
                          className="flex flex-col text-left p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition active:scale-98 group"
                        >
                          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-amber-100 group-hover:text-amber-900 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <span className="mt-3 text-xs font-bold text-slate-900">Shift & Duty</span>
                          <span className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">Hours, break timer & rest alarms</span>
                        </button>

                        {/* 2. Earnings & Payouts */}
                        <button
                          type="button"
                          onClick={() => setRiderPanel('earnings')}
                          className="flex flex-col text-left p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition active:scale-98 group"
                        >
                          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-amber-100 group-hover:text-amber-900 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <span className="mt-3 text-xs font-bold text-slate-900">Earnings & Payouts</span>
                          <span className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">MoMo withdrawal & ledger</span>
                        </button>

                        {/* 3. Vehicle & Documents */}
                        <button
                          type="button"
                          onClick={() => setRiderPanel('vehicle')}
                          className="flex flex-col text-left p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition active:scale-98 group"
                        >
                          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-amber-100 group-hover:text-amber-900 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <span className="mt-3 text-xs font-bold text-slate-900">Vehicle & Papers</span>
                          <span className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">Make, model & expiries</span>
                        </button>

                        {/* 4. Radar & Navigation */}
                        <button
                          type="button"
                          onClick={() => setRiderPanel('preferences')}
                          className="flex flex-col text-left p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition active:scale-98 group"
                        >
                          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-amber-100 group-hover:text-amber-900 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                          </div>
                          <span className="mt-3 text-xs font-bold text-slate-900">Radar & GPS</span>
                          <span className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">Radius, zones & GPS app</span>
                        </button>

                        {/* 5. Driver Profile */}
                        <button
                          type="button"
                          onClick={() => setRiderPanel('profile')}
                          className="flex flex-col text-left p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition active:scale-98 group"
                        >
                          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-amber-100 group-hover:text-amber-900 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <span className="mt-3 text-xs font-bold text-slate-900">Driver Profile</span>
                          <span className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">Avatar & selfie verification</span>
                        </button>

                        {/* 6. Safety & Incidents */}
                        <button
                          type="button"
                          onClick={() => setRiderPanel('incidents')}
                          className="flex flex-col text-left p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition active:scale-98 group"
                        >
                          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-amber-100 group-hover:text-amber-900 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <span className="mt-3 text-xs font-bold text-slate-900">Safety & Reports</span>
                          <span className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">
                            {incidents.length} report{incidents.length === 1 ? '' : 's'} recorded
                          </span>
                        </button>
                      </div>

                      {/* 7. App & System Settings full width button */}
                      <button
                        type="button"
                        onClick={() => setRiderPanel('app_settings')}
                        className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition active:scale-98"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-bold text-slate-900">App & System Preferences</p>
                            <p className="text-[11px] text-slate-500">Notifications, language & alert prompts</p>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {/* Sign Out Button */}
                      <button
                        type="button"
                        onClick={() => void logout()}
                        className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 hover:border-rose-200 active:scale-98 shadow-xs flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Sign Out from Driver Partner</span>
                      </button>
                    </div>
                  )}

                  {/* SUB-PANEL: SHIFT & DUTY */}
                  {riderPanel === 'shift' && (
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-extrabold text-slate-900 text-sm">Shift Status & Controls</h3>
                        <p className="mt-1 text-xs text-slate-500">Manage your working hours, driving shifts, and mandatory rest pauses.</p>

                        <div className="mt-4 rounded-xl bg-slate-50 p-4 border border-slate-100">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Current State</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            {shiftOnBreak ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 border border-amber-200">
                                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                On Rest Break
                              </span>
                            ) : shiftActive ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900 border border-emerald-200">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                Shift Active (Driving)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-300">
                                <span className="h-2 w-2 rounded-full bg-slate-400" />
                                Off Duty
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-2">Recorded shift time: <strong className="text-slate-800">{shiftHoursFormatted}</strong></p>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => void updateShift(shiftActive ? 'stop' : 'start')}
                            className={`rounded-xl py-3 text-xs font-bold text-white transition active:scale-95 shadow-sm ${
                              shiftActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                          >
                            {shiftActive ? 'End Shift' : 'Start Shift'}
                          </button>
                          <button
                            type="button"
                            disabled={!shiftActive}
                            onClick={() => void updateShift('break')}
                            className="rounded-xl bg-amber-400 py-3 text-xs font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-40 active:scale-95 shadow-sm"
                          >
                            {shiftOnBreak ? 'Resume Driving' : 'Take Break'}
                          </button>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                        <h3 className="font-extrabold text-slate-900 text-sm">Driver Fatigue & Safety Checks</h3>
                        
                        <label className="flex items-center justify-between gap-3 text-xs font-bold text-slate-800 cursor-pointer">
                          <div>
                            <p>Rest Break Reminders</p>
                            <p className="text-[11px] font-normal text-slate-500">Encourages a 15-minute rest after every 2 hours of active driving</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={settings.break_reminders_enabled}
                            onChange={(e) => void saveSetting({ break_reminders_enabled: e.target.checked })}
                            className="h-4 w-4 rounded text-amber-500 accent-amber-500"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-3 text-xs font-bold text-slate-800 cursor-pointer pt-3 border-t border-slate-100">
                          <div>
                            <p>Alertness Audio Checks</p>
                            <p className="text-[11px] font-normal text-slate-500">Subtle audible chime prompt during late-night or prolonged shifts</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={settings.alertness_prompts_enabled}
                            onChange={(e) => void saveSetting({ alertness_prompts_enabled: e.target.checked })}
                            className="h-4 w-4 rounded text-amber-500 accent-amber-500"
                          />
                        </label>
                      </section>
                    </div>
                  )}

                  {/* SUB-PANEL: EARNINGS & PAYOUTS */}
                  {riderPanel === 'earnings' && (
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-extrabold text-slate-900 text-sm">Mobile Money Withdrawal</h3>
                        <p className="mt-1 text-xs text-slate-500">Where earnings from wallet and digital trips are disbursed.</p>

                        <div className="mt-4">
                          <label className="block text-xs font-bold text-slate-800">
                            MoMo Account Number
                            <input
                              value={settings.withdrawal_account || ''}
                              onChange={(e) => setSettings((cur) => ({ ...cur, withdrawal_account: e.target.value }))}
                              onBlur={() => void saveSetting({ withdrawal_account: settings.withdrawal_account })}
                              placeholder="e.g. 0241234567"
                              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                            />
                          </label>
                          <p className="mt-1 text-[11px] text-slate-400">Supports MTN Mobile Money, Telecel Cash, and AT Money.</p>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <label className="block text-xs font-bold text-slate-800">
                            Earnings Summary Period
                            <select
                              value={settings.earnings_summary_period}
                              onChange={(e) => void saveSetting({ earnings_summary_period: e.target.value as 'daily' | 'weekly' | 'monthly' })}
                              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                            >
                              <option value="daily">Daily Summary</option>
                              <option value="weekly">Weekly Summary</option>
                              <option value="monthly">Monthly Summary</option>
                            </select>
                          </label>
                        </div>
                      </section>

                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-900">Platform Commission & Settlement</h4>
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                          Standard Keke Ride commission is <strong>15%</strong> on completed trips. Cash collected on trips is deducted from your digital earnings balance.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* SUB-PANEL: VEHICLE & PAPERS */}
                  {riderPanel === 'vehicle' && (
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-extrabold text-slate-900 text-sm">Vehicle Specifications</h3>
                        <p className="mt-1 text-xs text-slate-500">Tricycle details shown to matching passengers.</p>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {(
                            [
                              ['vehicle_make', 'Make'],
                              ['vehicle_model', 'Model'],
                              ['vehicle_color', 'Color'],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key} className="text-xs font-bold text-slate-700">
                              {label}
                              <input
                                value={riderVehicle[key]}
                                onChange={(e) => setRiderVehicle((cur) => ({ ...cur, [key]: e.target.value }))}
                                placeholder={label}
                                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium"
                              />
                            </label>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-extrabold text-slate-900 text-sm">Regulatory Document Expiries</h3>
                        <p className="mt-1 text-xs text-slate-500">Keep expiry dates updated to maintain uninterrupted platform dispatch access.</p>

                        <div className="mt-3 space-y-3">
                          {(
                            [
                              ['license_expiry', 'Driver License Expiry'],
                              ['insurance_expiry', 'Commercial Insurance Expiry'],
                              ['vehicle_papers_expiry', 'Vehicle Registration Expiry'],
                              ['roadworthy_expiry', 'Roadworthy Certificate Expiry'],
                            ] as const
                          ).map(([key, label]) => {
                            const warning = documentExpiryWarning(riderVehicle[key]);
                            return (
                              <label key={key} className="block text-xs font-bold text-slate-800">
                                <div className="flex items-center justify-between">
                                  <span>{label}</span>
                                  {warning ? (
                                    <span className="font-bold text-[11px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                      {warning}
                                    </span>
                                  ) : riderVehicle[key] ? (
                                    <span className="font-bold text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                      Valid
                                    </span>
                                  ) : null}
                                </div>
                                <input
                                  type="date"
                                  value={riderVehicle[key]}
                                  onChange={(e) => setRiderVehicle((cur) => ({ ...cur, [key]: e.target.value }))}
                                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-medium focus:border-amber-500 focus:outline-none"
                                />
                              </label>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          disabled={savingVehicle}
                          onClick={() => void saveVehicle()}
                          className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition active:scale-95 disabled:opacity-50"
                        >
                          {savingVehicle ? 'Saving Details...' : 'Save Vehicle & Documents'}
                        </button>
                      </section>
                    </div>
                  )}

                  {/* SUB-PANEL: RADAR & NAVIGATION */}
                  {riderPanel === 'preferences' && (
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <h3 className="font-extrabold text-slate-900 text-sm">Dispatch Radar Radius</h3>
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800 border border-amber-200">
                            {settings.rider_request_radius_km} km
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Maximum distance to receive nearby passenger trip offers.</p>

                        <div className="mt-4">
                          <input
                            type="range"
                            min="1"
                            max="50"
                            value={settings.rider_request_radius_km}
                            onChange={(e) => setSettings((cur) => ({ ...cur, rider_request_radius_km: Number(e.target.value) }))}
                            onMouseUp={() => void saveSetting({ rider_request_radius_km: settings.rider_request_radius_km })}
                            onTouchEnd={() => void saveSetting({ rider_request_radius_km: settings.rider_request_radius_km })}
                            className="w-full accent-amber-500 cursor-pointer"
                          />
                          <div className="flex justify-between text-[11px] font-bold text-slate-400 mt-1">
                            <span>1 km (Local town)</span>
                            <span>25 km</span>
                            <span>50 km (Greater Cape Coast)</span>
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-extrabold text-slate-900 text-sm">Preferred Operating Areas</h3>
                        <p className="mt-1 text-xs text-slate-500">Focus your proximity radar around specific high-demand transit hubs.</p>
                        <input
                          value={settings.preferred_areas || ''}
                          onChange={(e) => setSettings((cur) => ({ ...cur, preferred_areas: e.target.value }))}
                          onBlur={() => void saveSetting({ preferred_areas: settings.preferred_areas })}
                          placeholder="Cape Coast Castle, UCC Campus, Kotokuraba Market, Elmina"
                          className="mt-3 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium focus:border-amber-500 focus:outline-none"
                        />
                      </section>

                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-extrabold text-slate-900 text-sm">External GPS Navigation App</h3>
                        <p className="mt-1 text-xs text-slate-500">Application used when launching turn-by-turn route directions.</p>
                        <select
                          value={settings.navigation_app}
                          onChange={(e) => void saveSetting({ navigation_app: e.target.value as 'google_maps' | 'waze' | 'in_app' })}
                          className="mt-3 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                        >
                          <option value="google_maps">Google Maps (Recommended)</option>
                          <option value="waze">Waze</option>
                          <option value="in_app">In-App Built-in Navigation</option>
                        </select>
                      </section>
                    </div>
                  )}

                  {/* SUB-PANEL: DRIVER PROFILE */}
                  {riderPanel === 'profile' && (
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-extrabold text-slate-900 text-sm">Account Photo & Identity</h3>
                        <p className="mt-1 text-xs text-slate-500">Your passenger-facing portrait photo.</p>

                        <div className="mt-4 flex items-center gap-4">
                          <AccountAvatar
                            name={user?.name || 'Driver Partner'}
                            phone={user?.phone || ''}
                            avatarUrl={user?.avatar_url}
                            onChanged={updateAvatar}
                          />
                          <div className="flex-1">
                            <p className="text-xs font-bold text-slate-900">{user?.name || 'Driver Partner'}</p>
                            <p className="text-[11px] text-slate-500">{user?.phone} (Verified)</p>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <h4 className="text-xs font-bold text-slate-900">Periodic Identity Verification</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">Upload a live selfie when requested to confirm active driver identity.</p>
                          <input ref={selfieRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadSelfie} />
                          <button
                            type="button"
                            onClick={() => selfieRef.current?.click()}
                            className="mt-3 w-full rounded-xl border border-slate-300 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 transition active:scale-95 flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>Upload Identity Selfie</span>
                          </button>
                        </div>
                      </section>
                    </div>
                  )}

                  {/* SUB-PANEL: SAFETY & INCIDENTS */}
                  {riderPanel === 'incidents' && (
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <h3 className="font-extrabold text-slate-900 text-sm">Recorded Safety Reports</h3>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                            {incidents.length} Total
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Trip incidents submitted by or associated with your trips.</p>

                        {incidents.length === 0 ? (
                          <div className="mt-6 py-8 text-center">
                            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            </div>
                            <p className="text-xs font-bold text-slate-800">Clear Safety Record</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">No open safety incidents or reported violations.</p>
                          </div>
                        ) : (
                          <div className="mt-4 space-y-2">
                            {incidents.map((incident) => (
                              <div key={incident.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold capitalize text-slate-900">{incident.category.replace('_', ' ')}</p>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                      incident.status === 'resolved'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}
                                  >
                                    {incident.status}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-1">{incident.summary}</p>
                                <p className="mt-2 text-[10px] font-semibold text-slate-400">
                                  {new Date(incident.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  )}

                  {/* SUB-PANEL: APP SETTINGS */}
                  {riderPanel === 'app_settings' && (
                    <div className="space-y-4">
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                        <h3 className="font-extrabold text-slate-900 text-sm">System & Notification Controls</h3>

                        <label className="flex items-center justify-between gap-3 text-xs font-bold text-slate-800 cursor-pointer">
                          <div>
                            <p>Push Notifications</p>
                            <p className="text-[11px] font-normal text-slate-500">Incoming dispatch offers and safety notices</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={settings.push_notifications_enabled}
                            onChange={(e) => void saveSetting({ push_notifications_enabled: e.target.checked })}
                            className="h-4 w-4 rounded text-amber-500 accent-amber-500"
                          />
                        </label>

                        <div className="pt-3 border-t border-slate-100">
                          <label className="block text-xs font-bold text-slate-800">
                            App Language
                            <select
                              value={settings.preferred_language}
                              onChange={(e) => void saveSetting({ preferred_language: e.target.value })}
                              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                            >
                              <option value="en">English (Ghana)</option>
                              <option value="tw">Twi</option>
                              <option value="fat">Fante (Cape Coast)</option>
                            </select>
                          </label>
                        </div>
                      </section>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export default SettingsMenu;
