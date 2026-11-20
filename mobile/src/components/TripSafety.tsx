import { useState } from 'react';
import apiClient from '../api/client';

interface Coordinates {
  lat: number;
  lng: number;
}

interface TripSafetyProps {
  userId: number;
  tripId: number;
  status: string;
  pickup: Coordinates;
  pickupLabel: string;
  pickupNote: string | null;
  destination: Coordinates;
  destinationLabel: string;
  estimatedFare: number;
  paymentMethod: string;
  passengerLocation: Coordinates | null;
  riderLocation: Coordinates | null;
}

interface TrustedContact {
  name: string;
  phone: string;
}

const emergencyNumber = (import.meta.env.VITE_EMERGENCY_NUMBER || '112')
  .replace(/[^\d+]/g, '') || '112';

const readTrustedContact = (userId: number): TrustedContact => {
  try {
    return {
      name: localStorage.getItem(`trusted_contact_name_${userId}`) || '',
      phone: localStorage.getItem(`trusted_contact_phone_${userId}`) || '',
    };
  } catch (error: unknown) {
    console.error('Could not read the saved trusted contact:', error);
    return { name: '', phone: '' };
  }
};

const formatCoordinates = (coordinates: Coordinates) => (
  `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`
);

const TripSafety = ({
  userId,
  tripId,
  status,
  pickup,
  pickupLabel,
  pickupNote,
  destination,
  destinationLabel,
  estimatedFare,
  paymentMethod,
  passengerLocation,
  riderLocation,
}: TripSafetyProps) => {
  const [contact, setContact] = useState<TrustedContact>(() => readTrustedContact(userId));
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [liveShareUrl, setLiveShareUrl] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isRevokingShare, setIsRevokingShare] = useState(false);

  const buildShareMessage = () => {
    const passengerMapUrl = passengerLocation
      ? `https://www.openstreetmap.org/?mlat=${passengerLocation.lat}&mlon=${passengerLocation.lng}#map=16/${passengerLocation.lat}/${passengerLocation.lng}`
      : null;
    const riderMapUrl = riderLocation
      ? `https://www.openstreetmap.org/?mlat=${riderLocation.lat}&mlon=${riderLocation.lng}#map=16/${riderLocation.lat}/${riderLocation.lng}`
      : null;

    return [
      `I'm sharing my Keke trip (Trip #${tripId}).`,
      `Status: ${status}.`,
      `Pickup: ${pickupLabel} (${formatCoordinates(pickup)}).`,
      pickupNote ? `Pickup instructions: ${pickupNote}.` : null,
      `Destination: ${destinationLabel} (${formatCoordinates(destination)}).`,
      `Estimated fare: GHS ${estimatedFare.toFixed(2)} (${paymentMethod}; final fare may vary).`,
      passengerLocation ? `My current location: ${passengerMapUrl}` : null,
      riderLocation ? `Rider's latest location: ${riderMapUrl}` : 'Rider location is not available yet.',
      'This is a location snapshot, not continuous live sharing.',
    ].filter(Boolean).join('\n');
  };

  const saveContact = async () => {
    const normalizedPhone = contact.phone.trim();
    if (normalizedPhone && !/^[+0-9().\-\s]{7,24}$/.test(normalizedPhone)) {
      setError('Enter a valid phone number, including country code if needed.');
      setNotice(null);
      return;
    }

    try {
      if (normalizedPhone) {
        localStorage.setItem(`trusted_contact_name_${userId}`, contact.name.trim());
        localStorage.setItem(`trusted_contact_phone_${userId}`, normalizedPhone);
      } else {
        localStorage.removeItem(`trusted_contact_name_${userId}`);
        localStorage.removeItem(`trusted_contact_phone_${userId}`);
      }
      setContact({ ...contact, phone: normalizedPhone });
      await apiClient.patch('/settings', {
        trusted_contact_name: normalizedPhone ? contact.name.trim() || null : null,
        trusted_contact_phone: normalizedPhone || null,
      });
      setError(null);
      setNotice(normalizedPhone ? 'Trusted contact saved on this device.' : 'Trusted contact removed.');
      setIsEditingContact(false);
    } catch (saveError: unknown) {
      console.error('Could not save the trusted contact:', saveError);
      setError('Could not save the contact on this device.');
      setNotice(null);
    }
  };

  const createLiveShare = async () => {
    setError(null);
    setNotice(null);
    setIsCreatingShare(true);
    try {
      const response = await apiClient.post<{ token: string }>(`/trips/${tripId}/share`);
      const url = `${window.location.origin}/trip-share/${encodeURIComponent(response.data.token)}`;
      setLiveShareUrl(url);

      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: 'Follow my Keke trip live',
            text: 'You can follow my trip live until this link expires.',
            url,
          });
          setNotice('Live trip sharing started.');
        } catch (shareError: unknown) {
          if (!(shareError instanceof Error) || shareError.name !== 'AbortError') {
            throw shareError;
          }
        }
      } else {
        await navigator.clipboard.writeText(url);
        setNotice('Live link created and copied.');
      }
    } catch (shareError: unknown) {
      console.error('Could not create the live trip share:', shareError);
      setError('Could not start live trip sharing. Please try again.');
    } finally {
      setIsCreatingShare(false);
    }
  };

  const revokeLiveShare = async () => {
    setError(null);
    setNotice(null);
    setIsRevokingShare(true);
    try {
      await apiClient.delete(`/trips/${tripId}/share`);
      setLiveShareUrl(null);
      setNotice('Live trip sharing stopped.');
    } catch (revokeError: unknown) {
      console.error('Could not stop live trip sharing:', revokeError);
      setError('Could not stop live trip sharing. Please try again.');
    } finally {
      setIsRevokingShare(false);
    }
  };

  const copyLiveShare = async () => {
    if (! liveShareUrl) return;
    try {
      await navigator.clipboard.writeText(liveShareUrl);
      setNotice('Live trip link copied.');
    } catch {
      setError('Could not copy the live trip link.');
    }
  };

  const shareTrip = async () => {
    setError(null);
    setNotice(null);
    const text = buildShareMessage();

    if (contact.phone) {
      window.location.href = `sms:${encodeURIComponent(contact.phone)}?body=${encodeURIComponent(text)}`;
      setNotice('Review and send the trip details in your messaging app.');
      return;
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'My Keke trip', text });
        setNotice('Trip details shared.');
      } catch (shareError: unknown) {
        if (shareError instanceof Error && shareError.name === 'AbortError') return;
        console.error('Could not share trip details:', shareError);
        setError('Could not open the share sheet. Try again or contact emergency services directly.');
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setNotice('Trip details copied. Paste them into a message to your trusted contact.');
    } catch (clipboardError: unknown) {
      console.error('Could not copy trip details:', clipboardError);
      setError('Sharing is unavailable here. Save a trusted contact or use an app on your phone that supports sharing.');
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/80 p-4" aria-label="Trip safety">
      <h4 className="font-bold tracking-tight text-slate-900">Trip safety</h4>
      <p className="mt-1 text-xs text-gray-600">
        Share a live trip link or a one-time snapshot with someone you trust.
      </p>
      <p className="mt-2 text-xs text-gray-700">
        Estimated fare: ₵{estimatedFare.toFixed(2)} · Payment: {paymentMethod}
      </p>

      <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-900">Live trip sharing</p>
            <p className="text-xs text-slate-500">
              {liveShareUrl ? 'Your trusted contact can follow updates.' : 'Expires automatically after 12 hours.'}
            </p>
          </div>
          {liveShareUrl ? (
            <button
              type="button"
              onClick={() => void revokeLiveShare()}
              disabled={isRevokingShare}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"
            >
              {isRevokingShare ? 'Stopping...' : 'Stop sharing'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void createLiveShare()}
              disabled={isCreatingShare}
              className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {isCreatingShare ? 'Creating...' : 'Share live'}
            </button>
          )}
        </div>
        {liveShareUrl && (
          <button
            type="button"
            onClick={() => void copyLiveShare()}
            className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700"
          >
            Copy live link
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void shareTrip()}
          className="rounded-xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Share trip
        </button>
        <a
          href={`tel:${emergencyNumber}`}
          className="flex items-center justify-center rounded-xl bg-orange-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-orange-700"
          aria-label={`Call emergency services at ${emergencyNumber}`}
        >
          Call {emergencyNumber}
        </a>
      </div>

      <details
        className="mt-3"
        open={isEditingContact}
        onToggle={(event) => setIsEditingContact(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-semibold text-gray-800">
          {contact.phone
            ? `Trusted contact${contact.name ? `: ${contact.name}` : ' saved'}`
            : 'Add a trusted contact'}
        </summary>
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-gray-700" htmlFor={`trusted-name-${userId}`}>
            Contact name
          </label>
          <input
            id={`trusted-name-${userId}`}
            value={contact.name}
            onChange={(event) => setContact({ ...contact, name: event.target.value })}
            maxLength={100}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            placeholder="Name"
          />
          <label className="block text-xs font-medium text-gray-700" htmlFor={`trusted-phone-${userId}`}>
            Phone number
          </label>
          <input
            id={`trusted-phone-${userId}`}
            type="tel"
            value={contact.phone}
            onChange={(event) => setContact({ ...contact, phone: event.target.value })}
            maxLength={24}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            placeholder="+233..."
          />
          <button
            type="button"
            onClick={saveContact}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700"
          >
            Save trusted contact
          </button>
        </div>
      </details>

      {notice && <p className="mt-3 text-xs text-green-800" role="status">{notice}</p>}
      {error && <p className="mt-3 text-xs text-red-700" role="alert">{error}</p>}
      <p className="mt-2 text-[11px] text-gray-500">
        Emergency calling opens your phone dialer. Confirm your local emergency number before relying on it.
      </p>
    </section>
  );
};

export default TripSafety;
