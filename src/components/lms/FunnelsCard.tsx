import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FunnelSummary, myFunnels } from '../../lib/portal';
import { Button, CARD, Chip } from './lms-ui';

const stage = (funnel: FunnelSummary) =>
  funnel.live ? 'Live' : funnel.deployed ? 'Preview ready' : funnel.paid ? 'Building' : funnel.hasBrief ? 'Brief ready' : 'Drafting';

/**
 * The member's funnels at a glance, and the way to start another. A new funnel is its own build: one problem, one
 * customer, so a second offer or audience means a second funnel rather than stretching the first.
 */
export default function FunnelsCard({ openPath }: { openPath: (path: string) => void }) {
  const { user } = useAuth();
  const [funnels, setFunnels] = useState<FunnelSummary[] | null>(null);

  useEffect(() => {
    if (!user) return;
    myFunnels().then(setFunnels).catch(() => setFunnels([]));
  }, [user?.id]);

  if (!funnels) return null;

  return (
    <section className={`${CARD} h-full p-6`} aria-labelledby="dash-funnels">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-label text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Work</p><h2 id="dash-funnels" className="mt-1 font-editorial text-[22px] font-semibold tracking-[-0.01em]">{funnels.length ? (funnels.length === 1 ? 'Your funnel' : 'Your funnels') : 'Start your first funnel'}</h2></div>
        <Button variant={funnels.length ? 'ghost' : 'accent'} onClick={() => openPath('/launchpad/apply')}>
          {funnels.length ? 'Build another funnel' : 'Reserve your build spot'}
        </Button>
      </div>
      {funnels.length === 0 ? (
        <p className="mt-3 max-w-[560px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
          A funnel built around one problem for one customer, live in seven days. Tell us what you sell and we draft the brief for you to review.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--pg-line-soft)]">
          {funnels.map((funnel) => (
            <li key={funnel.token} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <button onClick={() => openPath(`/funnel/${funnel.token}`)} className="min-w-0 truncate text-left font-medium hover:underline underline-offset-4 cursor-pointer">{funnel.label}</button>
              <Chip tone={funnel.live ? 'accent' : 'neutral'}>{stage(funnel)}</Chip>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
