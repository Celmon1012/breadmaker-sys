import React from 'react';
import { Route } from '../types';
import { FOUNDRY_THEME, LAUNCHPAD_THEME, Pill, ProgramTheme, themeStyle } from './program-ui';

export interface ProgramSummary {
  route: Route;
  theme: ProgramTheme;
  label: string;
  accentWord: string;
  headline: string;
  body: string;
  facts: { term: string; detail: string }[];
  ctaLabel: string;
}

export const PROGRAM_SUMMARIES: ProgramSummary[] = [
  {
    route: 'launchpad',
    theme: LAUNCHPAD_THEME,
    label: 'Guided sales funnel launch',
    accentWord: 'Launchpad',
    headline: 'Launch your first sales funnel, live in 7 days.',
    body: 'For busy owners who are not technical and do not want to become technical. We tell you what to do each day, build the hard parts with you, and stay until it is live.',
    facts: [
      { term: 'For', detail: 'Coaches, consultants, creators and local service businesses' },
      { term: 'Time', detail: 'About 1-2 hours a day for one week' },
      { term: 'You leave with', detail: 'A live funnel that takes enquiries, bookings or payments, with follow-up and tracking' },
    ],
    ctaLabel: 'Reserve Your Build Spot',
  },
  {
    route: 'foundry',
    theme: FOUNDRY_THEME,
    label: '30-day build program',
    accentWord: 'Foundry',
    headline: 'Build and own the systems your business runs on.',
    body: 'For business owners and operators who want ownership of their systems. You get your own server, code and data sovereignty, with our agentic team showing you what to do at every step.',
    facts: [
      { term: 'For', detail: 'Freelancers, small agency owners and solo founders comfortable with GitHub and a terminal' },
      { term: 'Time', detail: '6-8 hours a week for four weeks, plus a Friday review' },
      { term: 'You leave with', detail: 'A live system with payments, automation and one AI agent, on a Day-30 scorecard that passes' },
    ],
    ctaLabel: 'Apply for the next cohort',
  },
];

export function ProgramSummaryCard({ program, onNavigate, openPath }: { program: ProgramSummary; onNavigate: (route: Route) => void; openPath: (path: string) => void; key?: React.Key }) {
  return (
    <div
      style={themeStyle(program.theme)}
      className="flex h-full flex-col rounded-[11px] bg-[var(--pg-card)] p-8 border border-[var(--pg-line-soft)] lg:p-12"
    >
      <p className="font-label text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">
        {program.label}
      </p>
      <h3 className="mt-5 font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.01em] text-[var(--pg-ink)] lg:text-[36px]">
        Breadmaker <span className="text-[var(--pg-accent)]">{program.accentWord}</span>
      </h3>
      <p className="mt-4 font-editorial text-[21px] leading-[1.3] text-[var(--pg-ink)]">{program.headline}</p>
      <p className="mt-4 text-[16px] leading-[1.65] text-[var(--pg-body)]">{program.body}</p>

      <dl className="mt-7 border-t border-[var(--pg-line-soft)]">
        {program.facts.map((fact) => (
          <div
            key={fact.term}
            className="grid gap-1 border-b border-[var(--pg-line-soft)] py-4 sm:grid-cols-[130px_1fr] sm:gap-4"
          >
            <dt className="font-label text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--pg-body)] sm:pt-[3px]">
              {fact.term}
            </dt>
            <dd className="text-[16px] leading-[1.55] text-[var(--pg-ink)]">{fact.detail}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex justify-center pt-9">
        <Pill onClick={() => openPath(`/${program.route}#apply`)}>{program.ctaLabel}</Pill>
      </div>
    </div>
  );
}
