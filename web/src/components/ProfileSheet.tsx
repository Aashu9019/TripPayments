import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Avatar, Sheet } from './ui';
import { formatPhone } from './ContactButtons';
import { useCalendar } from './DateField';
import { setCalendar } from '../lib/dates';

const SIZE = 256;

/** Center-crop to a square and compress, so uploads stay ~15 KB on mobile data. */
export async function toSquareJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Your account: photo and name. Changes show up on every trip you are on. */
export function ProfileSheet({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (o: boolean) => void; onChanged?: () => void }) {
  const { user, updateUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const cal = useCalendar();

  useEffect(() => {
    if (open && user) setName(user.name);
  }, [open, user]);

  if (!user) return null;
  // Render the account as a "member" so the same Avatar component is used everywhere.
  const preview = { id: user.id, name: user.name, color: 0, avatar: user.avatarId ?? null, role: 'member' as const, phone: user.phone, claimed: true, left_at: null };

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { avatarId } = await api.setAvatar(await toSquareJpeg(file));
      updateUser({ avatarId });
      onChanged?.();
      toast.success('Photo updated');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : (e as Error).message || 'Could not upload photo');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removePhoto() {
    setBusy(true);
    try {
      await api.removeAvatar();
      updateUser({ avatarId: null });
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not remove photo');
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (!name.trim() || name.trim() === user!.name) return onOpenChange(false);
    setBusy(true);
    try {
      await api.updateMe({ name });
      updateUser({ name: name.trim() });
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Your profile"
      footer={
        <button className="btn" onClick={saveName} disabled={busy}>
          Done
        </button>
      }
    >
      <div className="profile-photo">
        <button className="profile-avatar" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Change photo">
          <Avatar member={preview} />
          <span className="profile-cam" aria-hidden>
            <Camera size={16} />
          </span>
        </button>
        <div className="profile-actions">
          <button className="chip" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Camera size={16} /> {user.avatarId ? 'Change photo' : 'Add photo'}
          </button>
          {user.avatarId && (
            <button className="chip" onClick={removePhoto} disabled={busy} aria-label="Remove photo">
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <p className="hint">{formatPhone(user.phone)} · your friends see this name and photo on every trip.</p>
      <div className="field-label">Dates</div>
      <div className="segmented" role="radiogroup" aria-label="Calendar">
        <button role="radio" aria-checked={cal === 'bs'} onClick={() => setCalendar('bs')}>
          Nepali (BS)
        </button>
        <button role="radio" aria-checked={cal === 'ad'} onClick={() => setCalendar('ad')}>
          English (AD)
        </button>
      </div>
    </Sheet>
  );
}
