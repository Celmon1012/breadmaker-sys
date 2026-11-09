import React, { useEffect, useState } from 'react';
import { AVATAR_EVENT, getAvatarUrl } from '../../lib/avatar';

/** First letters of the name (or email) for the placeholder when there is no photo. */
export function initialsOf(name: string) {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** The signed-in member's photo address, kept fresh when they change it. */
export function useMyAvatar(userId: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getAvatarUrl(userId)
        .then((value) => !cancelled && setUrl(value))
        .catch(() => !cancelled && setUrl(null));
    };
    load();
    window.addEventListener(AVATAR_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(AVATAR_EVENT, load);
    };
  }, [userId]);
  return url;
}

/** A round photo, or the initials on the dark placeholder. */
export default function Avatar({ url, name, size = 36, className = '' }: { url?: string | null; name: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) };
  if (url && !broken) {
    return <img src={url} alt="" onError={() => setBroken(true)} style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span
      style={style}
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--pg-ink)] font-semibold text-[var(--pg-bg)] ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}
