import { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import apiClient from '../../api/client';
import echo from '../../api/echo';
import TripHistory from '../../components/TripHistory';
import ReportTripIssue from '../../components/ReportTripIssue';
import TripSafety from '../../components/TripSafety';
import AccountAvatar from '../../components/AccountAvatar';
import SettingsMenu from '../../components/SettingsMenu';
import { useToast } from '../../context/ToastContext';

interface AcceptedTrip {
  id: number;
  status: 'accepted' | 'arrived' | 'started' | 'completed';
  rider_id: number;
}

interface TripEvent {
  trip: {
    id: number;
    status: 'searching' | 'accepted' | 'arrived' | 'started' | 'completed' | 'cancelled';
    rider_id: number | null;
    message?: string | null;
  };
}

interface RestoredTrip {
  id: number;
  status: 'searching' | 'accepted' | 'arrived' | 'started';
  rider_id: number | null;
  pickup_latitude: number | string;
  pickup_longitude: number | string;
  pickup_location: string | null;
  destination_latitude: number | string;
  destination_longitude: number | string;
  destination_location: string | null;
  landmark_note: string | null;
  estimated_fare: number | string;
  payment_method: string;
  route_geometry: RouteCoordinate[] | null;
}

interface RiderLocationEvent {
  trip_id: number;
  lat: number;
  lng: number;
}

interface RiderLocation {
  trip_id: number;
  lat: number;
  lng: number;
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface TripRoute {
  id: number;
  pickup: Coordinates;
  pickupLabel: string;
  pickupNote: string | null;
  destination: Coordinates;
  destinationLabel: string;
  estimatedFare: number;
  paymentMethod: string;
  routeGeometry: RouteCoordinate[] | null;
}

type RouteCoordinate = [number, number];

interface PlaceResult {
  label: string;
  latitude: number;
  longitude: number;
}

interface SavedPlace {
  id: number;
  name: string;
  label: string;
  latitude: number;
  longitude: number;
}

interface TripEstimate {
  estimated_distance_km: number;
  estimated_fare: number;
  duration_minutes: number;
  route_geometry: RouteCoordinate[];
  currency: string;
  estimate_note: string;
}

interface EstimateState {
  key: string;
  data: TripEstimate;
}

interface EstimateError {
  key: string;
  message: string;
}

interface DestinationPickerProps {
  enabled: boolean;
  onSelect: (coordinates: Coordinates) => void;
}

const DestinationPicker = ({ enabled, onSelect }: DestinationPickerProps) => {
  useMapEvents({
    click(event) {
      if (enabled) {
        onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
      }
    },
  });

  return null;
};

const getEstimateKey = (pickup: Coordinates, destination: Coordinates) => (
  `${pickup.lat},${pickup.lng}:${destination.lat},${destination.lng}`
);

const PassengerHome = () => {
  const { user, updateAvatar } = useAuth();
  const toast = useToast();
  const [serviceMode, setServiceMode] = useState<'ride' | 'delivery'>('ride');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'mobile_money'>('cash');
  const [isRequesting, setIsRequesting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showBookingReview, setShowBookingReview] = useState(false);
  const [searchingTripId, setSearchingTripId] = useState<number | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [activeTrip, setActiveTrip] = useState<AcceptedTrip | null>(null);
  const { location, error: locationError } = useLocation(!!activeTrip);
  const [tripRoute, setTripRoute] = useState<TripRoute | null>(null);
  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null);
  const [destination, setDestination] = useState<Coordinates | null>(null);
  const [destinationName, setDestinationName] = useState('');
  const [destinationSearch, setDestinationSearch] = useState('');
  const [pickupNote, setPickupNote] = useState('');
  const [savedPlaceName, setSavedPlaceName] = useState('');
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [savedPlacesError, setSavedPlacesError] = useState<string | null>(null);
  const [isSavingPlace, setIsSavingPlace] = useState(false);
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [estimateState, setEstimateState] = useState<EstimateState | null>(null);
  const [estimateError, setEstimateError] = useState<EstimateError | null>(null);
  const [estimateAttempt, setEstimateAttempt] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const activeTripId = activeTrip?.id;
  
  const defaultLat = location?.coords.latitude ?? 5.1053;
  const defaultLng = location?.coords.longitude ?? -1.2466;
  const pickup = { lat: defaultLat, lng: defaultLng };
  const estimateKey = destination ? getEstimateKey(pickup, destination) : null;
  const estimate = estimateKey && estimateState?.key === estimateKey ? estimateState.data : null;
  const currentEstimateError = estimateKey && estimateError?.key === estimateKey
    ? estimateError.message
    : null;
  const isEstimating = !!destination && !estimate && !currentEstimateError;

  useEffect(() => {
    apiClient.get<{
      settings: {
        default_service_type: 'ride' | 'delivery';
        payment_method: 'cash' | 'wallet' | 'mobile_money';
      };
    }>('/settings')
      .then(({ data }) => {
        setServiceMode(data.settings.default_service_type || 'ride');
        setPaymentMethod(data.settings.payment_method || 'cash');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;

    // Listen to the private passenger channel for trip updates from drivers
    const channel = echo.private(`passenger.${user.id}`)
      .error((error: unknown) => {
        console.error('Could not subscribe to passenger trip updates:', error);
      })
      .listen('.TripAccepted', (event: TripEvent) => {
        console.log('A driver accepted the trip!', event);
        if (event.trip.status !== 'accepted' || event.trip.rider_id === null) return;
        setActiveTrip({
          id: event.trip.id,
          status: 'accepted',
          rider_id: event.trip.rider_id,
        });
        setIsSearching(false);
        setSearchingTripId(null);
        setSearchNotice(null);
        toast.success('A driver has accepted your request and is on the way!');
      })
      .listen('.TripStatusUpdated', (event: TripEvent) => {
        if (event.trip.status === 'cancelled') {
          if (event.trip.id === searchingTripId) {
            setIsSearching(false);
            setSearchingTripId(null);
            setTripRoute(null);
            setRequestError(event.trip.message || 'No riders accepted. Please try again.');
          }
          return;
        }

        setActiveTrip((currentTrip) => {
          if (!currentTrip || currentTrip.id !== event.trip.id) return currentTrip;
          if (event.trip.status === 'completed') return null;
          if (
            event.trip.status === 'accepted'
            || event.trip.status === 'arrived'
            || event.trip.status === 'started'
          ) {
            if (event.trip.rider_id === null) return currentTrip;
            return {
              id: event.trip.id,
              status: event.trip.status,
              rider_id: event.trip.rider_id,
            };
          }
          return currentTrip;
        });

        if (event.trip.status === 'completed') {
          setSearchingTripId(null);
          setTripRoute(null);
          toast.success('Trip completed! You can rate your ride and view receipt in Trip History.');
        }
      });

    return () => {
      channel.stopListening('.TripAccepted');
      echo.leave(`passenger.${user.id}`);
    };
  }, [searchingTripId, user]);

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();
    let requestInFlight = false;

    const restoreCurrentTrip = async () => {
      if (requestInFlight || controller.signal.aborted) return;
      requestInFlight = true;

      try {
        const { data } = await apiClient.get<{ trip: RestoredTrip | null }>('/trips/current', {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        if (!data.trip) {
          setActiveTrip(null);
          setIsSearching(false);
          setSearchingTripId(null);
          setTripRoute(null);
          setRestoreError(null);
          return;
        }

        const trip = data.trip;
        const pickupLat = Number(trip.pickup_latitude);
        const pickupLng = Number(trip.pickup_longitude);
        const destinationLat = Number(trip.destination_latitude);
        const destinationLng = Number(trip.destination_longitude);

        if (
          !Number.isFinite(pickupLat)
          || !Number.isFinite(pickupLng)
          || !Number.isFinite(destinationLat)
          || !Number.isFinite(destinationLng)
        ) {
          throw new Error('The current trip response contains invalid coordinates.');
        }

        setTripRoute({
          id: trip.id,
          pickup: { lat: pickupLat, lng: pickupLng },
          pickupLabel: trip.pickup_location || 'Pickup location',
          pickupNote: trip.landmark_note,
          destination: { lat: destinationLat, lng: destinationLng },
          destinationLabel: trip.destination_location || 'Destination',
          estimatedFare: Number(trip.estimated_fare),
          paymentMethod: trip.payment_method,
          routeGeometry: trip.route_geometry,
        });

        if (trip.status === 'searching') {
          setActiveTrip(null);
          setSearchingTripId(trip.id);
          setIsSearching(true);
        } else {
          const riderId = trip.rider_id;
          if (riderId === null) {
            throw new Error('The active trip response is missing its assigned rider.');
          }
          setSearchingTripId(null);
          setIsSearching(false);
          setActiveTrip((current) => {
            if (current?.id === trip.id && current.status === trip.status) return current;
            if (
              trip.status === 'accepted'
              || trip.status === 'arrived'
              || trip.status === 'started'
            ) {
              return {
                id: trip.id,
                status: trip.status,
                rider_id: riderId,
              };
            }
            return current;
          });
        }

        setRestoreError(null);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        console.error('Could not restore the current passenger trip:', error);
        setRestoreError('Could not refresh your current trip. Check your connection and try again.');
      } finally {
        requestInFlight = false;
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
  }, [activeTripId, searchingTripId, user]);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<{ saved_places: SavedPlace[] }>('/passenger/saved-places', {
      signal: controller.signal,
    })
      .then(({ data }) => {
        setSavedPlaces(data.saved_places);
        setSavedPlacesError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Could not load saved places:', error);
        setSavedPlacesError('Saved places could not be loaded.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activeTripId) return;

    const channel = echo.private(`trip.${activeTripId}`)
      .error((error: unknown) => {
        console.error('Could not subscribe to rider location updates:', error);
      })
      .listen('.RiderLocationUpdated', (event: RiderLocationEvent) => {
        if (event.trip_id === activeTripId) {
          setRiderLocation({ trip_id: event.trip_id, lat: event.lat, lng: event.lng });
        }
      });

    return () => {
      channel.stopListening('.RiderLocationUpdated');
      echo.leave(`trip.${activeTripId}`);
    };
  }, [activeTripId]);

  useEffect(() => {
    const query = destinationSearch.trim();
    if (query.length < 3 || (destination && query === destinationName)) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearchingPlaces(true);
      setPlaceSearchError(null);
      apiClient.get<{ results: PlaceResult[] }>('/trips/places', {
        params: { q: query },
        signal: controller.signal,
      })
        .then(({ data }) => setPlaceResults(data.results))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message = axios.isAxiosError<{ message?: string }>(error)
            ? error.response?.data?.message
            : undefined;
          setPlaceResults([]);
          setPlaceSearchError(message || 'Could not search places. Please try again.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearchingPlaces(false);
        });
    }, 1000);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [destination, destinationName, destinationSearch]);

  useEffect(() => {
    if (activeTrip || !destination || !estimateKey) return;

    const controller = new AbortController();

    apiClient.post<TripEstimate>('/trips/estimate', {
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
    }, { signal: controller.signal })
      .then((response) => {
        setEstimateState({ key: estimateKey, data: response.data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = axios.isAxiosError<{ message?: string }>(error)
          ? error.response?.data?.message
          : undefined;
        setEstimateError({
          key: estimateKey,
          message: message || 'Could not calculate the fare estimate. Please try choosing the destination again.',
        });
      });

    return () => controller.abort();
  }, [activeTrip, defaultLat, defaultLng, destination, estimateAttempt, estimateKey, pickup.lat, pickup.lng]);

  const handleDestinationSelect = (coordinates: Coordinates) => {
    setDestination(coordinates);
    setDestinationName('');
    setDestinationSearch('');
    setPlaceResults([]);
    setPlaceSearchError(null);
    setIsSearchingPlaces(false);
    setRequestError(null);
  };

  const handlePlaceSelect = (place: PlaceResult) => {
    setDestination({ lat: place.latitude, lng: place.longitude });
    setDestinationName(place.label);
    setDestinationSearch(place.label);
    setPlaceResults([]);
    setPlaceSearchError(null);
    setIsSearchingPlaces(false);
    setRequestError(null);
  };

  const handleSavedPlaceSelect = (place: SavedPlace) => {
    setDestination({ lat: place.latitude, lng: place.longitude });
    setDestinationName(place.label);
    setDestinationSearch(place.label);
    setPlaceResults([]);
    setPlaceSearchError(null);
    setRequestError(null);
  };

  const handleSavePlace = async () => {
    if (!destination || !destinationName.trim()) {
      setSavedPlacesError('Select a named destination before saving it.');
      return;
    }
    if (!savedPlaceName.trim()) {
      setSavedPlacesError('Enter a name such as Home or Work.');
      return;
    }

    setIsSavingPlace(true);
    setSavedPlacesError(null);
    try {
      const { data } = await apiClient.post<{ saved_place: SavedPlace }>('/passenger/saved-places', {
        name: savedPlaceName.trim(),
        label: destinationName.trim(),
        latitude: destination.lat,
        longitude: destination.lng,
      });
      setSavedPlaces((current) => [...current, data.saved_place].sort((a, b) => a.name.localeCompare(b.name)));
      setSavedPlaceName('');
    } catch (error: unknown) {
      const responseData = axios.isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(error)
        ? error.response?.data
        : undefined;
      setSavedPlacesError(
        (responseData?.errors ? Object.values(responseData.errors).flat()[0] : undefined)
        || responseData?.message
        || 'Could not save this place.',
      );
    } finally {
      setIsSavingPlace(false);
    }
  };

  const handleDeleteSavedPlace = async (savedPlace: SavedPlace) => {
    setSavedPlacesError(null);
    try {
      await apiClient.delete(`/passenger/saved-places/${savedPlace.id}`);
      setSavedPlaces((current) => current.filter((place) => place.id !== savedPlace.id));
    } catch (error: unknown) {
      console.error('Could not remove saved place:', error);
      setSavedPlacesError('Could not remove this saved place. Please try again.');
    }
  };

  const handleRequestRide = async () => {
    if (!destination) {
      setRequestError('Tap the map to choose your destination first.');
      return;
    }
    if (!estimate) {
      setRequestError('Wait for the fare estimate before requesting your ride.');
      return;
    }
    setShowBookingReview(true);
  };

  const confirmRequestRide = async () => {
    if (!destination || !estimate) {
      setShowBookingReview(false);
      setRequestError('Choose a destination and wait for its fare estimate before requesting a ride.');
      return;
    }

    setIsRequesting(true);
    setRequestError(null);
    setSearchNotice(null);
    try {
      const tripDestination = { ...destination };
      const tripEstimate = estimate;
      const tripDestinationLabel = destinationName.trim() || 'Map pin destination';
      const tripPickup = { ...pickup };
      const tripPickupLabel = location ? 'Current GPS Location' : 'Cape Coast (Web Fallback)';
      const response = await apiClient.post<{
        id: number;
        status: string;
        route_geometry: RouteCoordinate[];
        payment_method: 'cash' | 'wallet' | 'mobile_money';
      }>('/trips', {
        pickup_lat: tripPickup.lat,
        pickup_lng: tripPickup.lng,
        pickup_location: tripPickupLabel,
        landmark_note: pickupNote.trim() || null,
        destination_lat: tripDestination.lat,
        destination_lng: tripDestination.lng,
        destination_location: tripDestinationLabel,
        payment_method: paymentMethod,
      });
      
      setSearchingTripId(response.data.id);
      setTripRoute({
        id: response.data.id,
        pickup: tripPickup,
        pickupLabel: tripPickupLabel,
        pickupNote: pickupNote.trim() || null,
        destination: tripDestination,
        destinationLabel: tripDestinationLabel,
        estimatedFare: tripEstimate.estimated_fare,
        paymentMethod: response.data.payment_method || paymentMethod,
        routeGeometry: response.data.route_geometry,
      });
      setIsSearching(true);
      setShowBookingReview(false);
    } catch (error: unknown) {
      const responseData = axios.isAxiosError<{
        message?: string;
        errors?: Record<string, string[]>;
      }>(error) ? error.response?.data : undefined;
      const validationMessage = responseData?.errors
        ? Object.values(responseData.errors).flat()[0]
        : undefined;
      setRequestError(
        validationMessage
        || responseData?.message
        || 'Could not request a Keke. Check your connection and try again.',
      );
      setIsSearching(false);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleCancelRide = async () => {
    if (!searchingTripId || isCancelling) return;

    setIsCancelling(true);
    setRequestError(null);
    try {
      await apiClient.post(`/trips/${searchingTripId}/cancel`);
      setIsSearching(false);
      setSearchingTripId(null);
      setTripRoute(null);
      setSearchNotice('Ride request cancelled.');
    } catch (error: unknown) {
      const responseData = axios.isAxiosError<{
        message?: string;
        errors?: Record<string, string[]>;
      }>(error) ? error.response?.data : undefined;
      const validationMessage = responseData?.errors
        ? Object.values(responseData.errors).flat()[0]
        : undefined;
      setRequestError(
        validationMessage || responseData?.message || 'Could not cancel this ride request.',
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const mapDestination = activeTrip && tripRoute?.id === activeTrip.id
    ? tripRoute.destination
    : destination;
  const routeCoordinates = activeTrip && tripRoute?.id === activeTrip.id
    ? tripRoute.routeGeometry
    : estimate?.route_geometry;

  return (
    <div className="dashboard-shell passenger-dashboard relative h-screen w-full flex flex-col">
      <div className="absolute top-0 w-full z-[1000] p-4 pt-[calc(env(safe-area-inset-top)+1rem)] bg-gradient-to-b from-white/95 to-transparent pointer-events-none">
        <div className="dashboard-topbar flex justify-between items-center bg-white/95 backdrop-blur-xl p-3 rounded-2xl shadow-lg shadow-slate-900/10 border border-white/80 pointer-events-auto">
          <div className="flex items-center space-x-3">
            <AccountAvatar
              name={user?.name}
              phone={user?.phone}
              avatarUrl={user?.avatar_url}
              onChanged={updateAvatar}
              passenger
            />
            <div>
              <p className="text-sm font-bold tracking-tight text-slate-900">Passenger</p>
              <p className="text-xs text-gray-500">
                {activeTrip ? 'Trip in progress' : isSearching ? 'Searching...' : 'Ready to ride'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TripHistory />
            <SettingsMenu role="passenger" />
          </div>
        </div>
      </div>

      <div className="flex-grow z-0">
        <MapContainer 
          key={`${defaultLat}-${defaultLng}`} 
          center={[defaultLat, defaultLng]} 
          zoom={16} 
          zoomControl={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[defaultLat, defaultLng]}>
            <Popup>Your Location</Popup>
          </Marker>
          {mapDestination && (
            <>
              <Marker position={[mapDestination.lat, mapDestination.lng]}>
                <Popup>
                  {(activeTrip && tripRoute?.id === activeTrip.id
                    ? tripRoute.destinationLabel
                    : destinationName.trim()) || 'Destination'}
                </Popup>
              </Marker>
            </>
          )}
          {routeCoordinates && routeCoordinates.length > 1 && (
              <Polyline
                positions={routeCoordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number])}
                pathOptions={{ color: '#FFC107', weight: 5, opacity: 0.9 }}
              />
          )}
          {activeTrip && riderLocation?.trip_id === activeTrip.id && (
            <Marker position={[riderLocation.lat, riderLocation.lng]}>
              <Popup>Your rider is here</Popup>
            </Marker>
          )}
          <DestinationPicker
            enabled={!activeTrip && !isSearching && !isRequesting}
            onSelect={handleDestinationSelect}
          />
        </MapContainer>
      </div>

      <div className="absolute bottom-0 w-full z-[1000] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pointer-events-none">
        <div className="dashboard-sheet max-h-[62vh] overflow-y-auto bg-white/95 backdrop-blur-xl p-6 rounded-3xl shadow-2xl shadow-slate-900/15 border border-white/90 pointer-events-auto">
          {locationError && <p className="text-xs text-red-500 mb-2">{locationError}</p>}

          {!activeTrip && !isSearching && (
            <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              <button type="button" onClick={() => setServiceMode('ride')} className={`rounded-lg py-2.5 text-sm font-bold transition ${serviceMode === 'ride' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Ride</button>
              <button type="button" onClick={() => setServiceMode('delivery')} className={`rounded-lg py-2.5 text-sm font-bold transition ${serviceMode === 'delivery' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Delivery</button>
            </div>
          )}
          
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            {activeTrip
              ? activeTrip.status === 'arrived'
                ? 'Your driver has arrived'
                : activeTrip.status === 'started'
                  ? 'Trip in progress'
                  : 'Driver Assigned'
              : isSearching ? 'Finding your Keke...' : 'Where to?'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {activeTrip
              ? activeTrip.status === 'arrived'
                ? 'Your Keke is waiting at the pickup point.'
                : activeTrip.status === 'started'
                  ? 'Your ride has started. Pay the fare in cash at your destination.'
                  : 'Your Keke is en route.'
              : isSearching ? 'Broadcasting to nearby drivers.' : 'Request a Keke to your current location'}
          </p>

          {activeTrip && tripRoute?.id === activeTrip.id && user && (
            <TripSafety
              userId={user.id}
              tripId={activeTrip.id}
              status={activeTrip.status}
              pickup={tripRoute.pickup}
              pickupLabel={tripRoute.pickupLabel}
              pickupNote={tripRoute.pickupNote}
              destination={tripRoute.destination}
              destinationLabel={tripRoute.destinationLabel}
              estimatedFare={tripRoute.estimatedFare}
              paymentMethod={tripRoute.paymentMethod}
              passengerLocation={location
                ? { lat: location.coords.latitude, lng: location.coords.longitude }
                : null}
              riderLocation={riderLocation?.trip_id === activeTrip.id
                ? { lat: riderLocation.lat, lng: riderLocation.lng }
                : null}
            />
          )}
          {activeTrip && <ReportTripIssue tripId={activeTrip.id} />}

          {!activeTrip && !isSearching && (
            <div className="mb-4 space-y-3">
              <label className="block text-sm font-medium text-gray-700" htmlFor="destination-search">
                Search for a destination
              </label>
              <input
                id="destination-search"
                type="text"
                maxLength={120}
                value={destinationSearch}
                onChange={(event) => {
                  setDestinationSearch(event.target.value);
                  setDestination(null);
                  setDestinationName('');
                  setPlaceResults([]);
                  setPlaceSearchError(null);
                  setIsSearchingPlaces(false);
                  setRequestError(null);
                }}
                placeholder="Search an address or place"
                autoComplete="off"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-brand focus:outline-none"
              />
              {isSearchingPlaces && <p className="text-xs text-gray-500">Searching places...</p>}
              {placeSearchError && <p className="text-xs text-red-600" role="alert">{placeSearchError}</p>}
              {placeResults.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {placeResults.map((place) => (
                    <li key={`${place.latitude}-${place.longitude}-${place.label}`}>
                      <button
                        type="button"
                        onClick={() => handlePlaceSelect(place)}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-amber-50"
                      >
                        {place.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {savedPlacesError && (
                <p className="text-xs text-red-600" role="alert">{savedPlacesError}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Home', '⌂'],
                  ['Work', '▦'],
                  ['Favorite Places', '♡'],
                  ['Set Location On Map', '⌖'],
                ].map(([label, icon]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (label === 'Set Location On Map') {
                        setDestinationSearch('');
                        setPlaceResults([]);
                        setRequestError(null);
                        return;
                      }
                      const place = savedPlaces.find((item) => item.name.toLowerCase() === label.toLowerCase() || (label === 'Favorite Places' && savedPlaces.length > 0));
                      if (place) handleSavedPlaceSelect(place);
                      else setPlaceSearchError(`${label} has no saved location yet.`);
                    }}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-xs font-bold text-slate-700"
                  >
                    <span className="text-base text-amber-700">{icon}</span>{label}
                  </button>
                ))}
              </div>
              {savedPlaces.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-gray-600">Saved places</p>
                  <ul className="flex flex-wrap gap-2">
                    {savedPlaces.map((place) => (
                      <li key={place.id} className="flex items-center rounded-full border border-gray-200 bg-white">
                        <button
                          type="button"
                          onClick={() => handleSavedPlaceSelect(place)}
                          className="px-3 py-2 text-xs font-semibold text-gray-700 hover:text-amber-800"
                        >
                          {place.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSavedPlace(place)}
                          aria-label={`Remove ${place.name}`}
                          className="pr-3 text-xs text-gray-400 hover:text-red-600"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-gray-500">
                {destination
                  ? `${destinationName || 'Map pin destination'} selected. Tap the map to move it.`
                  : 'Search and select a place, or tap the map to choose a destination.'}
              </p>
              {destination && destinationName.trim() && !savedPlaces.some((place) => (
                place.label === destinationName.trim()
                && Math.abs(place.latitude - destination.lat) < 0.000001
                && Math.abs(place.longitude - destination.lng) < 0.000001
              )) && (
                <div className="flex gap-2">
                  <input
                    aria-label="Name this saved place"
                    value={savedPlaceName}
                    onChange={(event) => setSavedPlaceName(event.target.value)}
                    maxLength={60}
                    placeholder="Save as Home, Work..."
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSavePlace()}
                    disabled={isSavingPlace || savedPlaces.length >= 10}
                    className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
                  >
                    {isSavingPlace ? 'Saving…' : 'Save place'}
                  </button>
                </div>
              )}
              {savedPlaces.length >= 10 && (
                <p className="text-xs text-gray-500">You’ve reached the 10 saved-place limit. Remove one to save another.</p>
              )}
              <label className="block text-sm font-medium text-gray-700" htmlFor="pickup-note">
                Pickup instructions <span className="font-normal text-gray-500">(optional)</span>
                <input
                  id="pickup-note"
                  type="text"
                  maxLength={255}
                  value={pickupNote}
                  onChange={(event) => setPickupNote(event.target.value)}
                  placeholder="e.g. Wait by the pharmacy entrance"
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-brand focus:outline-none"
                />
              </label>
              {isEstimating && <p className="text-sm text-gray-500">Calculating estimate...</p>}
              {currentEstimateError && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-red-600">{currentEstimateError}</p>
                  <button
                    type="button"
                    onClick={() => setEstimateAttempt((attempt) => attempt + 1)}
                    className="shrink-0 text-sm font-semibold text-amber-700 underline"
                  >
                    Retry
                  </button>
                </div>
              )}
              {estimate && (
                <div className="rounded-xl bg-amber-50 p-3 text-sm text-gray-700">
                  <p className="font-semibold">
                    Approx. {estimate.estimated_distance_km.toFixed(2)} km · estimated fare ₵{estimate.estimated_fare.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">About {estimate.duration_minutes.toFixed(0)} minutes by road</p>
                  <p className="mt-1 text-xs text-gray-500">{estimate.estimate_note}</p>
                  <p className="mt-1 text-xs text-gray-600">Cash payment to the rider at trip completion.</p>
                </div>
              )}
            </div>
          )}

          {requestError && (
            <p className="mb-3 text-sm text-red-600" role="alert">
              {requestError}
            </p>
          )}
          {restoreError && (
            <p className="mb-3 text-sm text-red-600" role="alert">{restoreError}</p>
          )}
          {searchNotice && <p className="mb-3 text-sm text-gray-600">{searchNotice}</p>}
          
          {serviceMode === 'delivery' ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">♙</div>
              <p className="mt-3 font-bold text-slate-900">No deliveries booked</p>
              <p className="mt-1 text-xs text-slate-500">Delivery booking is not available yet.</p>
            </div>
          ) : (
          <button
            onClick={handleRequestRide}
            disabled={isRequesting || isSearching || !!activeTrip || !destination || !estimate}
            className="w-full bg-brand text-slate-950 font-bold py-4 rounded-xl shadow-md shadow-amber-500/20 hover:bg-amber-400 active:scale-[0.99] transition-all disabled:opacity-70 flex justify-center items-center"
          >
            {isRequesting ? (
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
            ) : activeTrip ? (
              'Trip Active'
            ) : isSearching ? (
              'Searching...'
            ) : !destination ? (
              'Choose destination on map'
            ) : isEstimating ? (
              'Calculating fare...'
            ) : currentEstimateError ? (
              'Retry fare estimate'
            ) : (
              'Review ride details'
            )}
          </button>
          )}
          {!activeTrip && !isSearching && (
            <p className="mt-2 text-center text-xs text-gray-500">
              You can cancel while searching, before a rider accepts. After acceptance, cancellation is not available in the app.
            </p>
          )}
          {isSearching && (
            <>
              <p className="mt-2 text-xs text-gray-500">
                Cancellation is available while we search, until a rider accepts your request.
              </p>
              <button
                type="button"
                onClick={handleCancelRide}
                disabled={isCancelling}
                className="mt-3 w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 disabled:opacity-60"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel ride request'}
              </button>
            </>
          )}
        </div>
      </div>
      {showBookingReview && estimate && destination && (
        <div className="fixed inset-0 z-[4000] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-review-title"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <h2 id="booking-review-title" className="text-xl font-bold text-gray-900">Review your ride</h2>
            <div className="mt-4 space-y-3 rounded-2xl bg-gray-50 p-4 text-sm">
              <p><span className="font-semibold">Pickup:</span> {location ? 'Your current location' : 'Cape Coast fallback location'}</p>
              {pickupNote.trim() && <p><span className="font-semibold">Pickup instructions:</span> {pickupNote.trim()}</p>}
              <p><span className="font-semibold">Destination:</span> {destinationName.trim() || 'Map pin destination'}</p>
              <p><span className="font-semibold">Distance:</span> approx. {estimate.estimated_distance_km.toFixed(2)} km</p>
              <p><span className="font-semibold">Estimated fare:</span> ₵{estimate.estimated_fare.toFixed(2)}</p>
              <p><span className="font-semibold">Payment:</span> Cash, paid to the rider after the trip.</p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-600">
              Fare and travel time are estimates. You may cancel while the app is searching for a rider. Once a rider accepts, cancellation is not available in the app.
            </p>
            {requestError && <p className="mt-3 text-sm text-red-600" role="alert">{requestError}</p>}
            <button
              type="button"
              onClick={() => void confirmRequestRide()}
              disabled={isRequesting}
              className="mt-5 w-full rounded-xl bg-brand px-4 py-3.5 font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:opacity-60"
            >
              {isRequesting ? 'Requesting…' : 'Confirm and find a rider'}
            </button>
            <button
              type="button"
              onClick={() => setShowBookingReview(false)}
              disabled={isRequesting}
              className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-60"
            >
              Go back
            </button>
          </section>
        </div>
      )}
    </div>
  );
};

export default PassengerHome;