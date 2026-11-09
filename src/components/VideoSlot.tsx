import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { describeVideo } from '../lib/lessonVideo';

/**
 * A video with a light branded poster: nothing from YouTube/Vimeo/Loom loads until
 * someone presses play. Without a usable link it renders nothing.
 */
export default function VideoSlot({
  url,
  title,
  sizeClassName = 'aspect-video',
  compact = false,
}: {
  url: string | null | undefined;
  title: string;
  /** sizing classes for the frame, e.g. 'aspect-video' or 'aspect-video lg:aspect-auto lg:h-[500px]' */
  sizeClassName?: string;
  /** smaller type and padding, for sidebars */
  compact?: boolean;
}) {
  const video = describeVideo(url);
  const [playing, setPlaying] = useState(false);
  const radius = compact ? 'rounded-[13px]' : 'rounded-[11px]';
  // Playing video keeps a dark frame; the placeholder and poster use a light one.
  const frame = `relative w-full overflow-hidden bg-[var(--pg-dark)] border border-[var(--pg-line-soft)] ${radius} ${sizeClassName}`;
  const lightFrame = `relative w-full overflow-hidden bg-[var(--pg-alt)] border border-[var(--pg-line-soft)] ${radius} ${sizeClassName}`;

  if (video.kind === 'embed' && playing) {
    const src = `${video.src}${video.src.includes('?') ? '&' : '?'}autoplay=1`;
    return (
      <div className={frame}>
        <iframe
          src={src}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  if (video.kind === 'file') {
    return (
      <div className={frame}>
        <video controls preload="metadata" src={video.src} className="absolute inset-0 h-full w-full" aria-label={title} />
      </div>
    );
  }

  const ready = video.kind === 'embed';
  const size = compact ? 'h-12 w-12' : 'h-16 w-16 lg:h-20 lg:w-20';
  const playButton = (
    <span className={`relative flex shrink-0 items-center justify-center ${size}`}>
      <span className="absolute inset-0 rounded-full bg-[var(--pg-accent)] opacity-40 motion-safe:animate-ping" aria-hidden="true" />
      <span
        className={`relative flex items-center justify-center rounded-full bg-[var(--pg-accent)] text-[var(--pg-accent-ink)] transition-transform group-hover:scale-105 ${size}`}
      >
        <Play className={`ml-0.5 fill-current ${compact ? 'h-5 w-5' : 'h-7 w-7 lg:h-8 lg:w-8'}`} />
      </span>
    </span>
  );

  // No usable video: show nothing rather than a placeholder.
  if (!ready) return null;

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play: ${title}`}
      className={`${lightFrame} group text-left cursor-pointer`}
    >
      <div className="absolute inset-0 bg-[rgba(162,71,18,0.06)]" />
      <p
        className={`absolute font-label font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)] ${
          compact ? 'left-5 top-5 text-[10.5px]' : 'left-7 top-7 text-[12px] lg:left-9 lg:top-9'
        }`}
      >
        Watch first
      </p>
      <span className="absolute inset-0 flex items-center justify-center">{playButton}</span>
    </button>
  );
}
