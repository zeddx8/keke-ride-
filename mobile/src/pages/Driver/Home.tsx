import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import { useAuth } from '../../context/AuthContext'
import { useLocation } from '../../hooks/useLocation';
import apiClient from '../../api/client';
import echo from '../../api/echo';
import SwipeToAccept from '../../components/SwipeToAccept';
import TripHistory from '../../components/TripHistory';
import ReportTripIssue from '../../components/ReportTripIssue';

interface IncomingTrip {
  trip_id: number;
  pickup_lat: number;
  pickup_lng: number;
  destination_lat: number;
  destination_lng: number;
  pickup_location?: string | null;
  destination_location?: string | null;
  landmark_note: string | null;
  estimated_fare: number | string;
  estimated_distance_km: number | string;
  timeout_seconds: number;
}

type RouteCoordinate = [number, number];

interface RiderSummary {
  trips_today: number;
  trips_this_week: number;
  estimated_fares_today: number;
  estimated_fares_this_week: number;
  distance_today_km: number;
  distance_this_week_km: number;
}

interface RiderNavigation {
  target: 'pickup' | 'destination';
  distance_km: number;
  duration_minutes: number;
  geometry: RouteCoordinate[];
}

interface ActiveTrip {
  id: number;
  status: 'accepted' | 'arrived' | 'started' | 'completed';
  rider_id: number;
  pickup_latitude: number;
  pickup_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  destination_location: string | null;
  landmark_note: string | null;
}

type RestoredTrip = Omit<
  ActiveTrip,
  'pickup_latitude' | 'pickup_longitude' | 'destination_latitude' | 'destination_longitude'
> & {
  pickup_latitude: number | string;
  pickup_longitude: number | string;
  destination_latitude: number | string;
  destination_longitude: number | string;
};

const DriverHome = () => {
  const { user, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [incomingTrip, setIncomingTrip] = useState<IncomingTrip | null>(null);
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [isUpdatingTrip, setIsUpdatingTrip] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [ratingSummary, setRatingSummary] = useState<{ average_rating: number | null; ratings_count: number } | null>(null);
  const [ratingSummaryError, setRatingSummaryError] = useState<string | null>(null);
  const [riderSummary, setRiderSummary] = useState<RiderSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<RiderNavigation | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(() => localStorage.getItem('rider_alerts_enabled') === 'true');
  const [alertSetupError, setAlertSetupError] = useState<string | null>(null);
  const { location, error: locationError } = useLocation(!!activeTrip || isOnline);
  const lastLocationUpdate = useRef<{ trackingKey: string; timestamp: number } | null>(null);
  const locationRef = useRef(location);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastNotifiedTripId = useRef<number | null>(null);

  const defaultLat = location?.coords.latitude ?? 5.1053;
  const defaultLng = location?.coords.longitude ?? -1.2466;
  const activeTripId = activeTrip?.id;

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<RiderSummary>('/rider/summary', { signal: controller.signal })
      .then(({ data }) => {
        setRiderSummary(data);
        setSummaryError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Could not load rider trip summary:', error);
        setSummaryError('Trip summary unavailable');
      });
    return () => controller.abort();
  }, []);

  const playRideRequestAlert = useCallback(() => {
    if (!alertsEnabled) return;

    if (audioContextRef.current?.state === 'running') {
      const context = audioContextRef.current;
      [0, 0.22, 0.44].forEach((offset) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime + offset);
        oscillator.stop(context.currentTime + offset + 0.17);
      });
    }

    if ('vibrate' in navigator) navigator.vibrate([250, 120, 250]);
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('New Keke Ride request', {
        body: 'Open the rider dashboard to review and accept the request.',
        tag: 'keke-ride-request',
      });
    }
  }, [alertsEnabled]);

  const enableRideAlerts = async () => {
    setAlertSetupError(null);
    try {
      if (!audioContextRef.current && 'AudioContext' in window) {
        audioContextRef.current = new AudioContext();
      }
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      if (
        !audioContextRef.current
        && !('vibrate' in navigator)
        && !('Notification' in window)
      ) {
        throw new Error('This browser does not support rider request alerts.');
      }
      localStorage.setItem('rider_alerts_enabled', 'true');
      setAlertsEnabled(true);
    } catch (error: unknown) {
      console.error('Could not enable rider request alerts:', error);
      setAlertSetupError(error instanceof Error ? error.message : 'Could not enable ride alerts. Please try again.');
      return;
    }

    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (error: unknown) {
        console.error('Could not request browser notification permission:', error);
        setAlertSetupError('Sound and vibration alerts are enabled, but browser notifications could not be enabled.');
      }
    }
  };

  useEffect(() => () => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    apiClient.get<{ average_rating: number | null; ratings_count: number }>('/rider/ratings', {
      signal: controller.signal,
    })
      .then(({ data }) => {
        setRatingSummary(data);
        setRatingSummaryError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Could not load rider rating summary:', error);
        setRatingSummaryError('Rating summary unavailable');
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();
    let requestInFlight = false;

    const restoreCurrentTrip = async () => {
      if (requestInFlight || controller.signal.aborted) return;
      requestInFlight = true;

      try {
        const { data } = await apiClient.get<{ is_online: boolean; trip: RestoredTrip | null }>('/trips/current', {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setIsOnline(data.is_online);

        if (!data.trip) {
          setActiveTrip(null);
          setRestoreError(null);
          return;
        }

        const trip = {
          ...data.trip,
          pickup_latitude: Number(data.trip.pickup_latitude),
          pickup_longitude: Number(data.trip.pickup_longitude),
          destination_latitude: Number(data.trip.destination_latitude),
          destination_longitude: Number(data.trip.destination_longitude),
        };

        if (
          !Number.isFinite(trip.pickup_latitude)
          || !Number.isFinite(trip.pickup_longitude)
          || !Number.isFinite(trip.destination_latitude)
          || !Number.isFinite(trip.destination_longitude)
        ) {
          throw new Error('The current trip response contains invalid coordinates.');
        }

        setActiveTrip((current) => (
          current?.id === trip.id && current.status === trip.status
            ? current
            : trip
        ));
        setIncomingTrip(null);
        setRestoreError(null);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        console.error('Could not restore the current rider trip:', error);
        setRestoreError('Could not refresh your current trip or online status. Check your connection and try again.');
      } finally {
        requestInFlight = false;
        if (!controller.signal.aborted) setIsRestoring(false);
      }
    };

    const handleResume = () => {
      if (document.visibilityState === 'visible') void restoreCurrentTrip();
    };

    void restoreCurrentTrip();
    const interval = window.setInterval(() => void restoreCurrentTrip(), 15_000);
    window.addEventListener('online', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('online', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [user]);

  useEffect(() => {
    if (!activeTripId || !activeTrip) return;

    const controller = new AbortController();
    let requestInFlight = false;

    const refreshNavigation = async () => {
      const currentLocation = locationRef.current;
      if (requestInFlight || controller.signal.aborted || !currentLocation) return;

      requestInFlight = true;
      try {
        const { data } = await apiClient.get<RiderNavigation>(`/trips/${activeTripId}/navigation`, {
          params: {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
          },
          signal: controller.signal,
        });
        if (
          !Array.isArray(data.geometry)
          || data.geometry.length < 2
          || data.geometry.some((coordinate) => (
            !Array.isArray(coordinate)
            || coordinate.length < 2
            || !Number.isFinite(Number(coordinate[0]))
            || !Number.isFinite(Number(coordinate[1]))
          ))
        ) {
          throw new Error('The navigation response contains an invalid route.');
        }

        setNavigation(data);
        setNavigationError(null);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        console.error('Could not refresh rider navigation:', error);
        const message = axios.isAxiosError<{ message?: string }>(error)
          ? error.response?.data?.message
          : undefined;
        setNavigationError(message || 'Route guidance is temporarily unavailable.');
      } finally {
        requestInFlight = false;
      }
    };

    void refreshNavigation();
    const interval = window.setInterval(() => void refreshNavigation(), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [activeTrip, activeTripId]);

  useEffect(() => {
    if ((!activeTripId && !isOnline) || !location) return;

    const now = Date.now();
    const trackingKey = activeTripId ? `trip:${activeTripId}` : 'online';
    if (
      lastLocationUpdate.current?.trackingKey === trackingKey
      && now - lastLocationUpdate.current.timestamp < 10_000
    ) {
      return;
    }
    lastLocationUpdate.current = { trackingKey, timestamp: now };

    apiClient.post('/rider/location', {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    }).catch((error: unknown) => {
      console.error('Could not share rider location:', error);
    });
  }, [activeTripId, isOnline, location]);

  useEffect(() => {
    if (!user || !isOnline || activeTrip) {
      if (user) echo.leave(`rider.${user.id}`);
      return;
    }

    const channel = echo.private(`rider.${user.id}`)
      .error((error: unknown) => {
        console.error('Could not subscribe to rider ride requests:', error);
      })
      .listen('.TripRequested', (event: IncomingTrip) => {
        console.log('New trip request received!', event);
        const trip = {
          ...event,
          pickup_lat: Number(event.pickup_lat),
          pickup_lng: Number(event.pickup_lng),
          destination_lat: Number(event.destination_lat),
          destination_lng: Number(event.destination_lng),
          estimated_fare: Number(event.estimated_fare),
          estimated_distance_km: Number(event.estimated_distance_km),
        };

        if (
          !Number.isFinite(trip.pickup_lat)
          || !Number.isFinite(trip.pickup_lng)
          || !Number.isFinite(trip.destination_lat)
          || !Number.isFinite(trip.destination_lng)
          || !Number.isFinite(trip.estimated_fare)
          || !Number.isFinite(trip.estimated_distance_km)
        ) {
          console.error('Received an invalid trip request payload:', event);
          return;
        }

        if (lastNotifiedTripId.current !== trip.trip_id) {
          lastNotifiedTripId.current = trip.trip_id;
          playRideRequestAlert();
        }
        setIncomingTrip(trip);
      });

    return () => {
      channel.stopListening('.TripRequested');
      echo.leave(`rider.${user.id}`);
    };
  }, [user, isOnline, activeTrip, alertsEnabled, playRideRequestAlert]);

  const toggleRideAlerts = async () => {
    if (alertsEnabled) {
      localStorage.removeItem('rider_alerts_enabled');
      setAlertsEnabled(false);
      return;
    }
    await enableRideAlerts();
  };

  const toggleOnlineStatus = async () => {
    if (isRestoring) return;
    const newStatus = !isOnline;

    try {
      await apiClient.post('/rider/status', { status: newStatus ? 'active' : 'offline' });
      setIsOnline(newStatus);
    } catch (error) {
      console.error('Failed to update backend status', error);
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      alert(message || 'Could not update your online status. Please try again.');
    }
  };

  const handleAcceptTrip = async () => {
    if (!incomingTrip) return;
    
    try {
      const response = await apiClient.post<ActiveTrip>(`/trips/${incomingTrip.trip_id}/accept`);
      setNavigation(null);
      setNavigationError(null);
      setActiveTrip(response.data);
      setIncomingTrip(null);
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      alert(message || 'Failed to accept. Another driver may have taken it.');
      setIncomingTrip(null);
    }
  };

  const handleDeclineTrip = () => {
    setIncomingTrip(null);
  };

  const advanceTrip = async () => {
    if (!activeTrip || isUpdatingTrip) return;

    const nextStatus = ({
      accepted: 'arrived',
      arrived: 'started',
      started: 'completed',
      completed: null,
    } satisfies Record<ActiveTrip['status'], 'arrived' | 'started' | 'completed' | null>)[activeTrip.status];

    if (!nextStatus) return;

    setIsUpdatingTrip(true);
    try {
      const response = await apiClient.post<{ id: number; status: ActiveTrip['status']; rider_id: number }>(
        `/trips/${activeTrip.id}/status`,
        { status: nextStatus },
      );

      if (response.data.status === 'completed') {
        setNavigation(null);
        setNavigationError(null);
        setActiveTrip(null);
        apiClient.get<RiderSummary>('/rider/summary')
          .then(({ data }) => {
            setRiderSummary(data);
            setSummaryError(null);
          })
          .catch((error: unknown) => {
            console.error('Could not refresh rider trip summary:', error);
            setSummaryError('Trip summary unavailable');
          });
        alert('Trip completed! Collect the cash fare from the passenger.');
      } else {
        setNavigation(null);
        setNavigationError(null);
        setActiveTrip({ ...activeTrip, status: response.data.status });
      }
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ message?: string; errors?: { status?: string[] } }>(error)
        ? error.response?.data?.errors?.status?.[0] || error.response?.data?.message
        : undefined;
      alert(message || 'Could not update the trip. Please try again.');
    } finally {
      setIsUpdatingTrip(false);
    }
  };

  const tripAction = activeTrip?.status === 'accepted'
    ? { title: 'Arrived at Pickup', action: 'arrived' }
    : activeTrip?.status === 'arrived'
      ? { title: 'Start Trip', action: 'started' }
      : activeTrip?.status === 'started'
        ? { title: 'Complete Trip', action: 'completed' }
        : null;

  return (
    <div className="dashboard-shell rider-dashboard relative h-screen w-full flex flex-col">
      {/* Top Status Bar */}
      <div className="absolute top-0 w-full z-[1000] p-4 pt-[calc(env(safe-area-inset-top)+1rem)] bg-gradient-to-b from-white/95 to-transparent pointer-events-none">
        <div className="dashboard-topbar flex justify-between items-center bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-lg shadow-slate-900/10 border border-white/80 pointer-events-auto">
          <div className="flex items-center space-x-3">
            <div className={`dashboard-avatar h-10 w-10 rounded-2xl flex items-center justify-center text-white font-bold transition-colors ${isOnline ? 'bg-emerald-600' : 'bg-slate-500'}`}>
              {user?.phone?.substring(user.phone.length - 4)}
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-slate-900">Rider dashboard</p>
              <p className={`text-xs ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
                {isRestoring
                  ? 'Restoring status...'
                  : activeTrip
                    ? 'On a Trip'
                    : isOnline
                      ? 'Online • Looking for trips'
                      : 'Offline'}
              </p>
              <p className="text-xs text-amber-700" aria-label="Rider rating">
                {ratingSummaryError
                  || (ratingSummary?.average_rating === null
                    ? ratingSummary ? 'No ratings yet' : 'Loading rating...'
                    : ratingSummary
                      ? `★ ${ratingSummary.average_rating.toFixed(2)} (${ratingSummary.ratings_count})`
                      : 'Loading rating...')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleRideAlerts()}
              className={`rounded-lg px-2 py-2 text-xs font-semibold ${alertsEnabled ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}
              aria-pressed={alertsEnabled}
              title="Enable sound, vibration, and browser notifications for ride requests"
            >
              {alertsEnabled ? 'Alerts on' : 'Enable alerts'}
            </button>
            <TripHistory />
            <button onClick={logout} className="dashboard-logout rounded-xl bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800 transition hover:bg-orange-100">
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Map Interface */}
      <div className="flex-grow z-0">
        <MapContainer 
          key={`${defaultLat}-${defaultLng}`}
          center={[defaultLat, defaultLng]} 
          zoom={16} 
          zoomControl={false}
          className="h-full w-full grayscale-[20%]"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[defaultLat, defaultLng]}>
            <Popup>Your Keke</Popup>
          </Marker>
          
          {incomingTrip && !activeTrip && (
            <>
              <Marker position={[incomingTrip.pickup_lat, incomingTrip.pickup_lng]}>
                <Popup>{incomingTrip.pickup_location || 'Passenger pickup'}</Popup>
              </Marker>
              <Marker position={[incomingTrip.destination_lat, incomingTrip.destination_lng]}>
                <Popup>{incomingTrip.destination_location || 'Passenger destination'}</Popup>
              </Marker>
            </>
          )}
          {activeTrip && (
            <>
              <Marker position={[activeTrip.pickup_latitude, activeTrip.pickup_longitude]}>
                <Popup>Passenger pickup</Popup>
              </Marker>
              <Marker position={[activeTrip.destination_latitude, activeTrip.destination_longitude]}>
                <Popup>{activeTrip.destination_location || 'Passenger destination'}</Popup>
              </Marker>
            </>
          )}
          {navigation?.geometry
            && activeTrip
            && navigation.target === (activeTrip.status === 'started' ? 'destination' : 'pickup') && (
            <Polyline
              positions={navigation.geometry.map(([longitude, latitude]) => [latitude, longitude] as [number, number])}
              pathOptions={{ color: '#0056D2', weight: 6, opacity: 0.9 }}
            />
          )}
        </MapContainer>
      </div>

      {/* Incoming Trip Overlay */}
      {incomingTrip && !activeTrip && (
        <div className="absolute inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4 pointer-events-auto">
          <div className="dashboard-request-card bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-bounce-short">
            <h3 className="text-xl font-bold text-gray-900 mb-2">New Ride Request!</h3>
            <p className="text-gray-600 mb-2 flex items-center gap-2">
              Pickup: {incomingTrip.pickup_location || incomingTrip.landmark_note || 'Nearby Passenger'}
            </p>
            <p className="text-sm text-gray-600 mb-2">
              Destination: {incomingTrip.destination_location || 'Map pin destination'}
            </p>
            <p className="text-sm text-gray-600 mb-2">
              Approx. {Number(incomingTrip.estimated_distance_km).toFixed(2)} km
            </p>
            <p className="text-brand font-bold text-lg mb-6">
              Est. Fare: ₵{incomingTrip.estimated_fare}
            </p>
            
            <SwipeToAccept 
              onAccept={handleAcceptTrip} 
              onDecline={handleDeclineTrip} 
              estimatedFare={String(incomingTrip.estimated_fare)} 
            />
          </div>
        </div>
      )}

      {/* Bottom Action Sheet */}
      <div className="absolute bottom-0 w-full z-[1000] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pointer-events-none">
        <div className="dashboard-sheet bg-white/95 backdrop-blur-xl p-6 rounded-3xl shadow-2xl shadow-slate-900/15 border border-white/90 pointer-events-auto">
          {restoreError && <p className="mb-3 text-sm text-red-600" role="alert">{restoreError}</p>}
          {alertSetupError && <p className="mb-3 text-sm text-red-600" role="alert">{alertSetupError}</p>}
          {activeTrip ? (
            <div>
              {locationError && <p className="text-xs text-red-500 mb-2">{locationError}</p>}
              {navigation
                && navigation.target === (activeTrip.status === 'started' ? 'destination' : 'pickup') && (
                <div className="mb-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-950" aria-live="polite">
                  <p className="font-bold">Route to {navigation.target}</p>
                  <p className="mt-1">
                    {navigation.distance_km.toFixed(1)} km · about {Math.round(navigation.duration_minutes)} min
                  </p>
                  <p className="mt-1 text-xs text-blue-800">Route updates periodically using your current location.</p>
                </div>
              )}
              {navigationError && <p className="mb-2 text-xs text-red-600" role="alert">{navigationError}</p>}
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                {activeTrip.status === 'accepted'
                  ? 'Pick up Passenger'
                  : activeTrip.status === 'arrived'
                    ? 'Waiting for Passenger'
                    : 'Trip in Progress'}
              </h3>
              <p className="text-sm text-gray-500 mb-4">{activeTrip.landmark_note || 'Head to pickup location'}</p>
              {tripAction && (
                <button
                  onClick={advanceTrip}
                  disabled={isUpdatingTrip}
                  className="w-full bg-brand text-slate-950 font-bold py-4 rounded-xl shadow-md shadow-amber-500/20 hover:bg-amber-400 active:scale-[0.99] transition-all disabled:opacity-70"
                >
                  {isUpdatingTrip ? 'Updating...' : tripAction.title}
                </button>
              )}
              <ReportTripIssue tripId={activeTrip.id} />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Your performance</h3>
                  <span className="text-xs text-gray-500">This week</span>
                </div>
                {summaryError ? (
                  <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700" role="alert">{summaryError}</p>
                ) : riderSummary ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Completed today</p>
                      <p className="mt-1 font-bold text-gray-900">{riderSummary.trips_today} rides</p>
                      <p className="text-xs text-gray-600">{riderSummary.distance_today_km.toFixed(1)} km</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Estimated fares today</p>
                      <p className="mt-1 font-bold text-gray-900">₵{riderSummary.estimated_fares_today.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">Not a payment record</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Completed this week</p>
                      <p className="mt-1 font-bold text-gray-900">{riderSummary.trips_this_week} rides</p>
                      <p className="text-xs text-gray-600">{riderSummary.distance_this_week_km.toFixed(1)} km</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Estimated fares this week</p>
                      <p className="mt-1 font-bold text-gray-900">₵{riderSummary.estimated_fares_this_week.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">Not a payment record</p>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Loading trip summary…</p>
                )}
              </div>
              <button
                onClick={toggleOnlineStatus}
                disabled={isRestoring}
                className={`w-full text-white font-bold py-4 rounded-xl shadow-md active:scale-[0.99] transition-all disabled:opacity-60 ${isOnline ? 'bg-orange-600 hover:bg-orange-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {isRestoring ? 'Restoring...' : isOnline ? 'Go Offline' : 'Go Online'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverHome;