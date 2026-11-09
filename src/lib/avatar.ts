import { supabase } from './supabase';

/**
 * Profile photos. Files live in the public `breadmaker-avatars` storage bucket under the member's own
 * folder, and the address is saved on profiles.avatar_url. Both come from migration 35.
 */

const BUCKET = 'breadmaker-avatars';
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Fired after the photo changes, so the sidebar and the profile page refresh without a reload. */
export const AVATAR_EVENT = 'bm-avatar-changed';

const friendly = (message: string) =>
  /bucket not found|not found/i.test(message)
    ? 'Photo uploads are not switched on yet. The team still needs to apply the profile photo update.'
    : /row-level security|violates|not allowed|unauthorized/i.test(message)
      ? 'You are not allowed to change this photo. Sign in again and retry.'
      : message;

export async function getAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
  // Before the migration the column does not exist; treat that as "no photo yet".
  if (error) return null;
  return ((data as { avatar_url?: string | null } | null)?.avatar_url as string | null) ?? null;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = TYPES[file.type];
  if (!ext) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > MAX_BYTES) throw new Error('That image is over 5MB. Choose a smaller one.');

  // A new file name each time, so browsers and the CDN never show the old photo.
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw new Error(friendly(error.message));

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: saveError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (saveError) throw new Error(friendly(saveError.message));

  window.dispatchEvent(new Event(AVATAR_EVENT));
  return url;
}

export async function removeAvatar(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (error) throw new Error(friendly(error.message));
  window.dispatchEvent(new Event(AVATAR_EVENT));
}
