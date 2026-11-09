export type LessonVideo =
  | { kind: 'none' }
  | { kind: 'unsupported' }
  | { kind: 'embed'; label: string; src: string }
  | { kind: 'file'; label: string; src: string };

/** Turns an editor-supplied video link (YouTube, Vimeo, Loom or a video file) into something the player can render. */
export function describeVideo(raw: string | null | undefined): LessonVideo {
  const value = raw?.trim();
  if (!value) return { kind: 'none' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: 'unsupported' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'unsupported' };
  const host = url.hostname.replace(/^www\.|^m\./, '');

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? url.pathname.slice(1)
        : url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/')
          ? url.pathname.split('/')[2]
          : url.searchParams.get('v');
    if (!id || !/^[\w-]{6,20}$/.test(id)) return { kind: 'unsupported' };
    return { kind: 'embed', label: 'YouTube video', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const idIndex = parts.findIndex((part) => /^\d+$/.test(part));
    if (idIndex < 0) return { kind: 'unsupported' };
    const id = parts[idIndex];
    // Unlisted videos carry a privacy hash either as the next path segment or ?h=.
    const hash = url.searchParams.get('h') ?? (parts[idIndex + 1] && /^[\da-f]+$/i.test(parts[idIndex + 1]) ? parts[idIndex + 1] : null);
    const params = new URLSearchParams({ dnt: '1', title: '0', byline: '0', portrait: '0' });
    if (hash) params.set('h', hash);
    return { kind: 'embed', label: 'Vimeo video', src: `https://player.vimeo.com/video/${id}?${params}` };
  }

  if (host === 'loom.com') {
    const id = url.pathname.split('/').filter(Boolean)[1];
    if (!id || !/^[\da-f]{16,40}$/i.test(id)) return { kind: 'unsupported' };
    return { kind: 'embed', label: 'Loom video', src: `https://www.loom.com/embed/${id}` };
  }

  if (/\.(mp4|webm|m4v|mov)$/i.test(url.pathname)) return { kind: 'file', label: 'video file', src: url.toString() };
  return { kind: 'unsupported' };
}
