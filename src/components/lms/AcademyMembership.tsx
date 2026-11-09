import React, { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { ACADEMY_FAQ, ACADEMY_INCLUDES } from '../../lib/systems';
import { CARD, Eyebrow } from './lms-ui';

interface AcademyMembershipProps {
  signedIn: boolean;
  onJoin: () => void;
}

/** The "What you get, every week" list from the Academy membership section. */
export function AcademyIncludes() {
  return (
    <div>
      <Eyebrow>Inside Prestige</Eyebrow>
      <h2 className="mt-3 font-editorial text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--pg-ink)]">
        What you get, every week.
      </h2>
      <ul className="mt-6 space-y-5">
        {ACADEMY_INCLUDES.map((item) => (
          <li key={item.title} className="flex gap-3">
            <Check className="mt-1 h-5 w-5 shrink-0 text-[var(--pg-accent)]" aria-hidden />
            <div>
              <p className="text-[17px] font-semibold text-[var(--pg-ink)]">{item.title}</p>
              <p className="mt-1 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the Academy gives a learner each week, with a sticky join card beside it. */
export default function AcademyMembership({ signedIn, onJoin }: AcademyMembershipProps) {
  return (
    <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
      <AcademyIncludes />

      <aside className={`${CARD} p-7 lg:sticky lg:top-24`}>
        <Eyebrow>Breadmaker Academy</Eyebrow>
        <p className="mt-3 font-editorial text-[24px] font-semibold leading-[1.15] text-[var(--pg-ink)]">
          Exclusive systems, weekly setups and education.
        </p>
        <p className="mt-3 text-[15px] leading-[1.6] text-[var(--pg-body)]">
          Open to enrolled learners. Pick a program below to see its syllabus and price.
        </p>
        <button
          onClick={onJoin}
          className="mt-6 w-full rounded-full bg-[var(--pg-accent)] px-6 py-3.5 text-[16px] font-medium text-[var(--pg-accent-ink)] transition-opacity hover:opacity-90 cursor-pointer"
        >
          {signedIn ? 'Browse the programs' : 'Join the Academy'}
        </button>
      </aside>
    </section>
  );
}

/** The Academy questions, shown at the foot of the catalog. */
export function AcademyFaq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="mt-14">
      <h3 className="font-editorial text-[22px] font-semibold text-[var(--pg-ink)]">Frequently asked questions</h3>
      <div className={`${CARD} mt-4 divide-y divide-[var(--pg-line-soft)]`}>
        {ACADEMY_FAQ.map((item, i) => (
          <div key={item.question}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[16px] font-medium text-[var(--pg-ink)] cursor-pointer"
            >
              {item.question}
              <Plus className={`h-4 w-4 shrink-0 transition-transform ${open === i ? 'rotate-45' : ''}`} aria-hidden />
            </button>
            {open === i && <p className="px-5 pb-4 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">{item.answer}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
