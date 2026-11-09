import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, FileText, TrendingUp } from 'lucide-react';

/**
 * The brand panel beside the sign-in form: a short carousel of what the dashboard gives you.
 * Each slide pairs a small illustrative card with one line of copy. Decorative only, so it is
 * hidden from assistive tech except for the slide text and controls.
 */

const SLIDES = [
  {
    title: 'One clear next step at a time',
    body: 'Work through your plan one step at a time, with nothing to figure out.',
    card: 'steps',
  },
  {
    title: 'Your progress saves automatically',
    body: 'Close the tab whenever you like. You pick up exactly where you left off.',
    card: 'progress',
  },
  {
    title: 'Your purchases and downloads stay here',
    body: 'Find everything you have bought in one place.',
    card: 'library',
  },
] as const;

const STEP_ROWS = ['Pick your platform', 'Review your funnel brief', 'Choose your web address'];
const LIBRARY_ROWS = ['Funnel brief', 'Session replays', 'Starter files'];

function MockCard({ kind }: { kind: (typeof SLIDES)[number]['card'] }) {
  return (
    <div className="w-full max-w-[400px] rounded-[18px] bg-white/95 p-6 text-left">
      {kind === 'steps' && (
        <>
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Today</p>
          <p className="mt-1 font-editorial text-[20px] font-semibold leading-tight text-[var(--pg-ink)]">Your next three steps</p>
          <ul className="mt-5 space-y-3.5">
            {STEP_ROWS.map((row, index) => (
              <li key={row} className="flex items-center gap-3 text-[14px] text-[var(--pg-ink)]">
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border ${
                    index === 0 ? 'border-[var(--pg-accent)] bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]' : 'border-[var(--pg-line)]'
                  }`}
                >
                  {index === 0 && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                {row}
              </li>
            ))}
          </ul>
        </>
      )}
      {kind === 'progress' && (
        <>
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Your progress</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pg-alt)] text-[var(--pg-accent)]">
              <TrendingUp className="h-5 w-5" />
            </span>
            <p className="font-editorial text-[20px] font-semibold leading-tight text-[var(--pg-ink)]">Saved as you go</p>
          </div>
          <div className="mt-5 space-y-3">
            {[72, 48, 20].map((width) => (
              <div key={width} className="h-2 overflow-hidden rounded-full bg-[var(--pg-alt)]">
                <div className="h-full rounded-full bg-[var(--pg-accent)]" style={{ width: `${width}%` }} />
              </div>
            ))}
          </div>
        </>
      )}
      {kind === 'library' && (
        <>
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Your library</p>
          <ul className="mt-4 divide-y divide-[var(--pg-line-soft)]">
            {LIBRARY_ROWS.map((row) => (
              <li key={row} className="flex items-center gap-3 py-3 text-[14px] text-[var(--pg-ink)]">
                <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--pg-alt)] text-[var(--pg-accent)]">
                  <FileText className="h-4 w-4" />
                </span>
                {row}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function AuthShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const slide = SLIDES[index];

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % SLIDES.length), 6500);
    return () => window.clearTimeout(timer);
  }, [index, paused, reduceMotion]);

  const step = (delta: number) => setIndex((current) => (current + delta + SLIDES.length) % SLIDES.length);

  return (
    <aside
      aria-label="What your dashboard gives you"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative flex h-full flex-col overflow-hidden rounded-[24px] bg-[var(--pg-accent)] text-[var(--pg-dark-ink)]"
      
    >
      {/* soft glass squares, the same quiet decoration on every slide */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute left-[7%] top-[9%] h-24 w-24 rounded-[6px] bg-white/10" />
        <span className="absolute right-[6%] top-[22%] h-32 w-20 rounded-[6px] bg-white/10" />
        <span className="absolute bottom-[34%] left-[10%] h-16 w-16 rounded-[6px] bg-white/10" />
      </div>

      <div className="relative flex flex-1 items-center justify-center px-10 pt-14">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={slide.card}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -10 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full justify-center"
            aria-hidden="true"
          >
            <MockCard kind={slide.card} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative px-10 pb-10 pt-10 text-center" aria-live="polite">
        <span className="inline-block rounded-full border border-white/40 bg-white/10 px-3 py-1 font-label text-[10.5px] font-semibold uppercase tracking-[0.08em]">
          Your dashboard
        </span>
        <h2 className="mx-auto mt-4 max-w-[440px] font-editorial text-[28px] font-semibold leading-[1.15] tracking-[-0.01em]">{slide.title}</h2>
        <p className="mx-auto mt-3 max-w-[400px] text-[16px] leading-[1.5] text-[var(--pg-dark-body)]">{slide.body}</p>

        <div className="mt-8 flex items-center justify-between">
          <button type="button" onClick={() => step(-1)} aria-label="Previous slide" className="rounded-full p-2 transition-colors hover:bg-white/15 cursor-pointer">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2" role="group" aria-label="Choose a slide">
            {SLIDES.map((item, position) => (
              <button
                key={item.card}
                type="button"
                onClick={() => setIndex(position)}
                aria-label={`Show slide ${position + 1}: ${item.title}`}
                aria-current={position === index}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${position === index ? 'w-10 bg-white' : 'w-8 bg-white/35 hover:bg-white/55'}`}
              />
            ))}
          </div>
          <button type="button" onClick={() => step(1)} aria-label="Next slide" className="rounded-full p-2 transition-colors hover:bg-white/15 cursor-pointer">
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
