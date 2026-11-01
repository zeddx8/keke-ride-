import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';

interface SharedTrip {
  id: number;
  status: string;
  pickup: { label: string; note: string | null; latitude: number; longitude: number };
  destination: { label: string; latitude: number; longitude: number };
  estimated_fare: number;
  payment_method: string;
  rider_location: { latitude: number; longitude: number; updated_at: string | null } | null;
  share_expires_at: string;
}

const riderIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const FitRoute = ({ trip }: { trip: SharedTrip }) => {
  const map = useMap();

  useEffect(() => {
    const points: L.LatLngExpression[] = [
      [trip.pickup.latitude, trip.pickup.longitude],
      [trip.destination.latitude, trip.destination.longitude],
    ];
    if (trip.rider_location) {
      points.push([trip.rider_location.latitude, trip.rider_location.longitude]);
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
  }, [map, trip]);

  return null;
};

const statusLabel: Record<string, string> = {
  searching: 'Searching for a rider',
  accepted: 'Rider accepted',
  arrived: 'Rider arrived',
  started: 'Trip in progress',
  completed: 'Trip completed',
  cancelled: 'Trip cancelled',
};

export default function TripShare({ token }: { token: string }) {
  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadTrip = async () => {
      try {
        const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api')
          .replace(/\/+$/, '');
        const response = await fetch(`${apiBaseUrl}/trip-share/${encodeURIComponent(token)}`, {
          headers: { Accept: 'application/json' },
        });
        const body = await response.json();
        if (! active) return;
        if (! response.ok) {
          throw new Error(body.message || 'This trip share is unavailable.');
        }
        setTrip(body.trip);
        setError(null);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'This trip share is unavailable.');
          setTrip(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadTrip();
    const interval = window.setInterval(() => void loadTrip(), 10_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">Loading live trip...</main>;
  }

  if (error || !trip) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Trip share unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="h-[55vh] min-h-72 w-full">
        <MapContainer
          center={[trip.pickup.latitude, trip.pickup.longitude]}
          zoom={14}
          className="h-full w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[trip.pickup.latitude, trip.pickup.longitude]} icon={riderIcon} />
          <Marker position={[trip.destination.latitude, trip.destination.longitude]} icon={riderIcon} />
          {trip.rider_location && (
            <Marker
              position={[trip.rider_location.latitude, trip.rider_location.longitude]}
              icon={riderIcon}
            />
          )}
          <FitRoute trip={trip} />
        </MapContainer>
      </div>

      <section className="relative -mt-5 rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{statusLabel[trip.status] || trip.status}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Trip #{trip.id}</h1>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Pickup</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{trip.pickup.label}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Destination</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{trip.destination.label}</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-700">
          Estimated fare: <strong>GHS {trip.estimated_fare.toFixed(2)}</strong> · {trip.payment_method}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Location updates every 10 seconds. This link expires at{' '}
          {new Date(trip.share_expires_at).toLocaleString()}.
        </p>
      </section>
    </main>
  );
}
