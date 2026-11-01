import { useState } from 'react';
import axios from 'axios';
import apiClient from '../api/client';

interface ReportTripIssueProps {
  tripId: number;
}

const categories = [
  { value: 'safety', label: 'Safety concern' },
  { value: 'payment', label: 'Payment issue' },
  { value: 'conduct', label: 'Conduct' },
  { value: 'lost_item', label: 'Lost item' },
  { value: 'service', label: 'Service issue' },
  { value: 'other', label: 'Other' },
] as const;

const ReportTripIssue = ({ tripId }: ReportTripIssueProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<(typeof categories)[number]['value']>('service');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const close = () => {
    if (isSubmitting) return;
    setIsOpen(false);
    setError(null);
    setSubmitted(false);
    setSummary('');
    setDetails('');
  };

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/trips/${tripId}/incidents`, {
        category,
        summary: summary.trim(),
        details: details.trim(),
      });
      setSubmitted(true);
    } catch (requestError: unknown) {
      const responseData = axios.isAxiosError<{
        message?: string;
        errors?: Record<string, string[]>;
      }>(requestError) ? requestError.response?.data : undefined;
      const validationMessage = responseData?.errors
        ? Object.values(responseData.errors).flat()[0]
        : undefined;
      setError(validationMessage || responseData?.message || 'Could not send your report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-3 rounded-xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-800 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        Report a problem
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`report-trip-title-${tripId}`}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id={`report-trip-title-${tripId}`} className="text-lg font-bold text-gray-900">
                  Report a problem
                </h2>
                <p className="mt-1 text-sm text-gray-600">Trip #{tripId}</p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={isSubmitting}
                aria-label="Close report form"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            {submitted ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status">
                <p className="font-semibold text-emerald-900">Report received</p>
                <p className="mt-1 text-sm text-emerald-800">
                  Our team will review your report and follow up if needed.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-slate-950"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={(event) => void submitReport(event)} className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">
                  Issue type
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as (typeof categories)[number]['value'])}
                    className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {categories.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Short summary
                  <input
                    required
                    maxLength={160}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder="What happened?"
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Details
                  <textarea
                    required
                    maxLength={2000}
                    rows={4}
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    placeholder="Share any details that will help our team follow up."
                    className="mt-1 w-full resize-y rounded-xl border border-gray-300 px-3 py-3 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

                <button
                  type="submit"
                  disabled={isSubmitting || !summary.trim() || !details.trim()}
                  className="w-full rounded-xl bg-brand px-4 py-3 font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Sending report...' : 'Send report'}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
};

export default ReportTripIssue;
