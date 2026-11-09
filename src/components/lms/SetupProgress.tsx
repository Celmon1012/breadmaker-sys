import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FunnelSummary, myFunnels } from '../../lib/portal';
import { Button, CARD } from './lms-ui';

interface Step {
  label: string;
  done: boolean;
  /** Does not count against finishing (a domain is optional). */
  optional?: boolean;
}

/**
 * The steps left on the member's funnel: brief, payment, address, preview, domain, going live. With several funnels
 * it shows the one furthest from live, with its name in front. It disappears once the funnel is live, and shows
 * nothing for a member without a funnel (the Funnels card invites them to start one).
 */
export default function SetupProgress({ openPath }: { openPath: (path: string) => void }) {
  const { user } = useAuth();
  const [funnel, setFunnel] = useState<{ summary: FunnelSummary; many: boolean } | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    myFunnels()
      .then((list) => {
        if (cancelled) return;
        // The funnel that still needs something, otherwise the newest.
        const pick = list.find((item) => !item.live || !item.paid) ?? list[0];
        setFunnel(pick ? { summary: pick, many: list.length > 1 } : null);
      })
      .catch(() => !cancelled && setFunnel(null));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!funnel) return null;

  const prefix = funnel.many ? `${funnel.summary.label}: ` : '';
  const steps: Step[] = [
    { label: `${prefix}Review your funnel brief`, done: funnel.summary.hasBrief },
    { label: `${prefix}Approve and deploy`, done: funnel.summary.paid },
    { label: `${prefix}Set your web address`, done: funnel.summary.addressSet },
    { label: `${prefix}Preview built`, done: funnel.summary.deployed },
    { label: `${prefix}Go live`, done: funnel.summary.live },
  ];
  if (steps.filter((step) => !step.optional).every((step) => step.done)) return null;

  const completed = steps.filter((step) => step.done).length;
  const percent = Math.round((completed / steps.length) * 100);
  const next = steps.find((step) => !step.done);

  return (
    <section className={`${CARD} mt-8 overflow-hidden lg:bg-[color-mix(in_srgb,var(--pg-alt)_35%,var(--pg-card))]!`} aria-label="Funnel setup progress">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div>
          <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Your next best step</p>
          <p className="mt-1 font-editorial text-[23px] font-semibold">{next?.label.replace(`${funnel.many ? `${funnel.summary.label}: ` : ''}`, '') ?? 'Your funnel is ready'}</p>
          <p className="mt-1 text-[13.5px] text-[var(--pg-body)]">{funnel.summary.label} · {completed} of {steps.length} steps complete</p>
        </div>
        <Button onClick={() => openPath(`/funnel/${funnel.summary.token}`)}>Continue setup <ArrowRight className="h-4 w-4" /></Button>
      </div>
      <div className="mx-6 h-2 overflow-hidden rounded-full bg-[var(--pg-line-soft)]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[var(--pg-accent)] transition-all" style={{ width: `${percent}%` }} />
      </div>
      <details className="mt-4 border-t border-[var(--pg-line-soft)] px-6 py-3.5 text-[13.5px]">
        <summary className="cursor-pointer font-medium text-[var(--pg-body)]">View all setup steps</summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {steps.map((step) => <li key={step.label} className={`flex items-center gap-2 ${step.done ? 'text-[var(--pg-ink)]' : 'text-[var(--pg-body)]'}`}>{step.done ? <Check className="h-4 w-4 text-[var(--pg-accent)]" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}{step.label}</li>)}
        </ul>
      </details>
    </section>
  );
}
