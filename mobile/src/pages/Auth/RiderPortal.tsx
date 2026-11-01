import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';
import DriverHome from '../Driver/Home';

interface RiderProfile {
  id: number;
  name: string;
  plate_number: string;
  verification_status: 'pending' | 'approved' | 'rejected';
  license_image_url: string;
  ghana_card_image_url: string;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(error)) return fallback;
  const validationMessage = error.response?.data?.errors
    ? Object.values(error.response.data.errors).flat()[0]
    : undefined;
  return validationMessage || error.response?.data?.message || fallback;
};

const RiderPortal = () => {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(user?.name ?? '');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [ghanaCardNumber, setGhanaCardNumber] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [licenseImage, setLicenseImage] = useState<File | null>(null);
  const [ghanaCardImage, setGhanaCardImage] = useState<File | null>(null);

  useEffect(() => {
    let isMounted = true;
    apiClient.get<{ profile: RiderProfile }>('/rider/profile')
      .then(({ data }) => {
        if (isMounted) setProfile(data.profile);
      })
      .catch((requestError: unknown) => {
        if (axios.isAxiosError(requestError) && requestError.response?.status === 404) return;
        if (isMounted) setError(getErrorMessage(requestError, 'Could not load your rider profile.'));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!licenseImage || !ghanaCardImage) {
      setError('Choose both your driver’s licence and Ghana Card images.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    const form = new FormData();
    form.append('name', name.trim());
    form.append('license_number', licenseNumber.trim());
    form.append('ghana_card_number', ghanaCardNumber.trim());
    form.append('plate_number', plateNumber.trim());
    form.append('license_image', licenseImage);
    form.append('ghana_card_image', ghanaCardImage);

    try {
      const { data } = await apiClient.post<{ profile: RiderProfile }>('/rider/profile', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile(data.profile);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, 'Could not submit your rider application.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (profile?.verification_status === 'approved') return <DriverHome />;

  const isPending = profile?.verification_status === 'pending';

  return (
    <main className="min-h-screen bg-off-white px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-card sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Keke Ride · Rider onboarding</p>
            <h1 className="mt-2 text-2xl font-extrabold text-gray-900">
              {isPending ? 'Application under review' : 'Complete your rider profile'}
            </h1>
          </div>
          <button type="button" onClick={logout} className="text-sm font-semibold text-gray-600 hover:text-gray-900">
            Sign out
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>
        )}

        {isPending ? (
          <div className="rounded-2xl bg-amber-50 p-5 text-sm leading-relaxed text-amber-950">
            <p className="font-bold">Thanks, {profile.name}. We’re reviewing your documents.</p>
            <p className="mt-2">You’ll be able to go online after an administrator approves your profile.</p>
            <p className="mt-2">Vehicle plate: <strong>{profile.plate_number}</strong></p>
          </div>
        ) : (
          <>
            {profile?.verification_status === 'rejected' && (
              <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                Your previous application was not approved. Correct your details and upload clear document images to submit again.
              </p>
            )}
            <p className="mb-5 text-sm leading-relaxed text-gray-600">
              To drive with Keke Ride, provide your driver’s licence, Ghana Card and vehicle details. Your account remains unavailable for rides until these are reviewed.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-semibold text-gray-800" htmlFor="rider-name">
                Full name
                <input id="rider-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500" />
              </label>
              <label className="block text-sm font-semibold text-gray-800" htmlFor="license-number">
                Driver’s licence number
                <input id="license-number" required maxLength={255} value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500" />
              </label>
              <label className="block text-sm font-semibold text-gray-800" htmlFor="ghana-card-number">
                Ghana Card number
                <input id="ghana-card-number" required maxLength={255} value={ghanaCardNumber} onChange={(event) => setGhanaCardNumber(event.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500" />
              </label>
              <label className="block text-sm font-semibold text-gray-800" htmlFor="plate-number">
                Vehicle plate number
                <input id="plate-number" required maxLength={20} value={plateNumber} onChange={(event) => setPlateNumber(event.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500" />
              </label>
              <label className="block text-sm font-semibold text-gray-800" htmlFor="license-image">
                Driver’s licence image
                <input id="license-image" type="file" required accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setLicenseImage(event.target.files?.[0] ?? null)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-amber-100 file:px-3 file:py-2 file:font-semibold" />
                <span className="mt-1 block text-xs font-normal text-gray-500">JPEG, PNG or WebP, up to 5 MB.</span>
              </label>
              <label className="block text-sm font-semibold text-gray-800" htmlFor="ghana-card-image">
                Ghana Card image
                <input id="ghana-card-image" type="file" required accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setGhanaCardImage(event.target.files?.[0] ?? null)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-amber-100 file:px-3 file:py-2 file:font-semibold" />
                <span className="mt-1 block text-xs font-normal text-gray-500">JPEG, PNG or WebP, up to 5 MB.</span>
              </label>
              <button type="submit" disabled={isSubmitting}
                className="w-full rounded-xl bg-brand px-4 py-3.5 font-bold text-slate-950 shadow-sm shadow-amber-500/20 transition hover:bg-amber-400 disabled:opacity-60">
                {isSubmitting ? 'Submitting…' : profile ? 'Resubmit application' : 'Submit for review'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
};

export default RiderPortal;
