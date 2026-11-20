import { useRef, useState, type ChangeEvent } from 'react';
import apiClient from '../api/client';
import { useToast } from '../context/ToastContext';

interface AccountAvatarProps {
  name?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  onChanged: (avatarUrl: string | null) => void;
  online?: boolean;
  passenger?: boolean;
}

export default function AccountAvatar({
  name,
  phone,
  avatarUrl,
  onChanged,
  online,
  passenger = false,
}: AccountAvatarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const fallback = name?.trim()
    ? name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    : phone?.replace(/\D/g, '').slice(-4) || 'KR';

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await apiClient.post<{ avatar_url: string }>('/profile/avatar', formData);
      onChanged(data.avatar_url);
      toast.success('Profile photo updated.');
    } catch {
      toast.error('Could not upload profile image. Use JPG, PNG, or WebP up to 5 MB.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const remove = async () => {
    try {
      await apiClient.delete('/profile/avatar');
      onChanged(null);
      toast.info('Profile photo removed.');
    } catch {
      toast.error('Could not remove profile photo.');
    }
  };

  const classes = passenger
    ? 'bg-slate-900 text-amber-300'
    : online
      ? 'bg-emerald-600 text-white'
      : 'bg-slate-500 text-white';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`dashboard-avatar relative h-10 w-10 overflow-hidden rounded-2xl flex items-center justify-center font-bold ring-1 ring-slate-900/10 ${classes}`}
        title="Upload profile image"
        disabled={uploading}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{fallback}</span>
        )}
        {uploading && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs">...</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={upload}
      />
      {avatarUrl && (
        <button
          type="button"
          onClick={remove}
          className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white border border-slate-300 text-[10px] leading-none text-slate-600"
          title="Remove profile image"
          aria-label="Remove profile image"
        >
          ×
        </button>
      )}
    </div>
  );
}
