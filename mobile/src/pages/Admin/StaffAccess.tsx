import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import apiClient from '../../api/client';

type AdminRole = 'super_admin' | 'operations' | 'support';

interface StaffMember {
  id: number;
  name: string | null;
  phone: string;
  admin_role: AdminRole;
  admin_active: boolean;
  created_at: string;
}

interface StaffResponse {
  data: StaffMember[];
  current_page: number;
  last_page: number;
  total: number;
}

const roles: { id: AdminRole; label: string; description: string }[] = [
  { id: 'super_admin', label: 'Super Admin', description: 'Full access, including staff roles and accounts.' },
  { id: 'operations', label: 'Operations', description: 'Trips, rider reviews, incidents, and audit history.' },
  { id: 'support', label: 'Support', description: 'View incidents and add internal follow-up notes.' },
];

const requestError = (error: unknown, fallback: string) => (
  axios.isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(error)
    ? Object.values(error.response?.data?.errors ?? {}).flat()[0]
      || error.response?.data?.message
      || fallback
    : fallback
);

const StaffAccess = ({ currentUserId }: { currentUserId: number }) => {
  const [staff, setStaff] = useState<StaffResponse | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<number, AdminRole>>({});
  const [page, setPage] = useState(1);
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('support');
  const [isInviting, setIsInviting] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadStaff = useCallback(async (pageNumber: number, signal?: AbortSignal) => {
    setError(null);
    try {
      const { data } = await apiClient.get<StaffResponse>('/admin/staff', {
        params: { page: pageNumber },
        signal,
      });
      setStaff(data);
      setPage(data.current_page);
      setRoleDrafts(Object.fromEntries(data.data.map((member) => [member.id, member.admin_role])));
    } catch (loadError: unknown) {
      if (!signal?.aborted) setError(requestError(loadError, 'Could not load administrator accounts.'));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const request = window.setTimeout(() => void loadStaff(page, controller.signal), 0);
    return () => {
      window.clearTimeout(request);
      controller.abort();
    };
  }, [loadStaff, page]);

  const updateRole = async (member: StaffMember) => {
    const nextRole = roleDrafts[member.id];
    if (!nextRole || nextRole === member.admin_role) return;
    if (!window.confirm(`Change ${member.name || member.phone} from ${member.admin_role.replace('_', ' ')} to ${nextRole.replace('_', ' ')}?`)) return;

    setSavingId(member.id);
    setError(null);
    setMessage(null);
    try {
      const { data } = await apiClient.patch<{ message: string }>(`/admin/staff/${member.id}/role`, {
        admin_role: nextRole,
      });
      setMessage(data.message);
      await loadStaff(page);
    } catch (saveError: unknown) {
      setError(requestError(saveError, 'Could not update this administrator role.'));
    } finally {
      setSavingId(null);
    }
  };

  const inviteStaff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsInviting(true);
    setError(null);
    setMessage(null);
    setFormError(null);
    try {
      const { data } = await apiClient.post<{ message: string }>('/admin/staff', {
        phone: newPhone,
        admin_role: newRole,
      });
      setMessage(data.message);
      setNewPhone('');
      setNewRole('support');
      setPage(1);
      await loadStaff(1);
    } catch (inviteError: unknown) {
      setFormError(requestError(inviteError, 'Could not create the administrator account.'));
    } finally {
      setIsInviting(false);
    }
  };

  const updateActive = async (member: StaffMember) => {
    const active = !member.admin_active;
    const action = active ? 'Reactivate' : 'Deactivate';
    if (!window.confirm(`${action} ${member.name || member.phone}'s administrator access?${active ? '' : ' Their active sessions will be revoked immediately.'}`)) return;

    setSavingId(member.id);
    setError(null);
    setMessage(null);
    try {
      const { data } = await apiClient.patch<{ message: string }>(`/admin/staff/${member.id}/active`, { active });
      setMessage(data.message);
      await loadStaff(page);
    } catch (updateError: unknown) {
      setError(requestError(updateError, `Could not ${action.toLowerCase()} this administrator account.`));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-900/5 sm:p-6" aria-labelledby="staff-access-title">
      <div className="mb-5">
        <h2 id="staff-access-title" className="text-lg font-bold tracking-tight">Administrator access</h2>
        <p className="mt-1 text-sm text-slate-500">
          Assign the least access needed for each admin. Every role change is recorded in the audit log.
        </p>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {roles.map((role) => (
          <article key={role.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900">{role.label}</h3>
            <p className="mt-1 text-sm text-slate-600">{role.description}</p>
          </article>
        ))}
      </div>

      <form onSubmit={inviteStaff} className="mb-5 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-[1fr_200px_auto]">
        <label className="text-sm font-semibold text-slate-700">
          Invite by phone number
          <input
            type="tel"
            required
            minLength={10}
            maxLength={15}
            pattern="[0-9]{10,15}"
            value={newPhone}
            onChange={(event) => setNewPhone(event.target.value.replace(/\D/g, ''))}
            placeholder="0241234567"
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Initial access
          <select
            value={newRole}
            onChange={(event) => setNewRole(event.target.value as AdminRole)}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            {roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
          </select>
        </label>
        <button
          type="submit"
          disabled={isInviting || savingId !== null}
          className="self-end rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
        >
          {isInviting ? 'Creating…' : 'Invite administrator'}
        </button>
      </form>
      {formError && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{formError}</p>}

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {message && <p className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">{message}</p>}

      {isLoading && !staff ? (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500" role="status">Loading administrator accounts…</p>
      ) : staff?.data.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">Administrator</th>
                  <th className="pb-3 pr-4">Access role</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.data.map((member) => (
                  <tr key={member.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-slate-900">{member.name || 'Unnamed administrator'}</p>
                      <p className="text-xs text-slate-500">{member.phone}{member.id === currentUserId ? ' · You' : ''}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Access role for ${member.name || member.phone}`}
                        value={roleDrafts[member.id] ?? member.admin_role}
                        disabled={member.id === currentUserId || savingId !== null}
                        onChange={(event) => setRoleDrafts((current) => ({
                          ...current,
                          [member.id]: event.target.value as AdminRole,
                        }))}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:bg-slate-100"
                      >
                        {roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${member.admin_active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`}>
                        {member.admin_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="py-3">
                      {member.id === currentUserId ? (
                        <span className="text-xs text-slate-500">Your own access cannot be changed here.</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!member.admin_active || savingId !== null || roleDrafts[member.id] === member.admin_role}
                            onClick={() => void updateRole(member)}
                            className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingId === member.id ? 'Saving…' : 'Save role'}
                          </button>
                          <button
                            type="button"
                            disabled={savingId !== null}
                            onClick={() => void updateActive(member)}
                            className={`rounded-lg px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${member.admin_active ? 'border border-red-200 bg-white text-red-700 hover:bg-red-50' : 'border border-green-200 bg-white text-green-700 hover:bg-green-50'}`}
                          >
                            {savingId === member.id ? 'Saving…' : member.admin_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {staff.last_page > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">{staff.total} administrator accounts</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((current) => current - 1)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= staff.last_page || isLoading}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
          {isLoading ? 'Loading administrator accounts…' : 'No administrator accounts were found.'}
        </p>
      )}
    </section>
  );
};

export default StaffAccess;
