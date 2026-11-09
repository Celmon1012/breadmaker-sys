import React, { useEffect, useMemo, useState } from 'react';
import { Route } from '../../types';
import { FunnelSummary, myFunnels } from '../../lib/portal';
import { LeadRow, myLeads } from '../../lib/agents';
import { Button, CARD, EmptyState, LearnerLayout, Loading, PageContainer, PageTitle } from './lms-ui';
import { Segmented } from './CardGrid';

const DAY = 86_400_000;
const LABEL = 'font-label text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-body)]';
const SEGMENTS = [
  { key: 'ready', name: 'Ready now', bar: 'bg-emerald-600' },
  { key: 'warming', name: 'Warming up', bar: 'bg-amber-500' },
  { key: 'early', name: 'Early', bar: 'bg-sky-600' },
  { key: 'none', name: 'Not scored', bar: 'bg-[var(--pg-line)]' },
] as const;

type Range = '7' | '30' | '90';
const inWindow = (lead: LeadRow, from: number, to: number) => {
  const at = new Date(lead.createdAt).getTime();
  return at >= from && at < to;
};
const segmentOf = (lead: LeadRow) => lead.segment ?? 'none';

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone?: 'good' | 'warn' }) {
  return (
    <div className={`${CARD} flex min-w-0 flex-col gap-2 p-4 sm:gap-3 sm:p-5`}>
      <p className={LABEL}>{label}</p>
      <p className="truncate font-editorial text-[32px] font-semibold leading-none tracking-[-0.02em] sm:text-[40px]">{value}</p>
      <p className={`text-[13px] leading-[1.4] sm:text-[14px] ${tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-[#B42318]' : 'text-[var(--pg-body)]'}`}>{sub}</p>
    </div>
  );
}

/**
 * How the member's funnels are doing, at /analytics, from the enquiries they have received (their own rows).
 * It reports enquiries, how ready those people are and whether each one was delivered. It does not show visits
 * or conversion, because the funnels do not report page views to us.
 */
export default function AnalyticsPage({ onNavigate, openPath }: { onNavigate: (route: Route) => void; openPath: (path: string) => void }) {
  const [funnels, setFunnels] = useState<FunnelSummary[] | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [range, setRange] = useState<Range>('30');

  useEffect(() => {
    myFunnels()
      .then(async (list) => {
        setLeads(await myLeads(list.map((funnel) => funnel.id)));
        setFunnels(list);
      })
      .catch(() => setFunnels([]));
  }, []);

  const days = Number(range);
  const now = Date.now();
  const current = useMemo(() => leads.filter((lead) => inWindow(lead, now - days * DAY, now + DAY)), [leads, days]);
  const previous = useMemo(() => leads.filter((lead) => inWindow(lead, now - 2 * days * DAY, now - days * DAY)), [leads, days]);

  const scored = current.filter((lead) => lead.score !== null);
  const average = scored.length ? Math.round(scored.reduce((sum, lead) => sum + (lead.score ?? 0), 0) / scored.length) : null;
  const delivered = current.filter((lead) => lead.status === 'sent' || lead.status === 'emailed').length;
  const waiting = current.filter((lead) => lead.status === 'pending' || lead.status === 'failed').length;
  const change = previous.length ? Math.round(((current.length - previous.length) / previous.length) * 100) : null;

  const trend = useMemo(() => {
    // One bar per day for 7 and 30 days; one per week for 90, so the bars stay readable on a phone.
    const step = days > 30 ? 7 : 1;
    const bars = Math.ceil(days / step);
    return Array.from({ length: bars }, (_, index) => {
      const to = now + DAY - (bars - 1 - index) * step * DAY;
      const from = to - step * DAY;
      const rows = leads.filter((lead) => inWindow(lead, from, to));
      return {
        label: new Date(to - DAY).toLocaleDateString([], { day: 'numeric', month: 'short' }),
        counts: SEGMENTS.map((segment) => rows.filter((lead) => segmentOf(lead) === segment.key).length),
        total: rows.length,
      };
    });
  }, [leads, days]);
  const peak = Math.max(1, ...trend.map((bar) => bar.total));

  const perFunnel = (funnels ?? []).map((funnel) => {
    const rows = current.filter((lead) => lead.jobId === funnel.id);
    const rowScores = rows.filter((lead) => lead.score !== null);
    return {
      funnel,
      total: rows.length,
      ready: rows.filter((lead) => lead.segment === 'ready').length,
      average: rowScores.length ? Math.round(rowScores.reduce((sum, lead) => sum + (lead.score ?? 0), 0) / rowScores.length) : null,
    };
  });

  return (
    <LearnerLayout active="analytics" onNavigate={onNavigate}>
      <PageContainer>
        <PageTitle>Analytics</PageTitle>
        <p className="mt-2 max-w-[640px] text-[15px] leading-[1.55] text-[var(--pg-body)] sm:text-[16px] sm:leading-[1.6]">How your funnels are doing, from the enquiries they have received.</p>

        {funnels === null ? (
          <Loading label="Opening your analytics…" />
        ) : funnels.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="Build a funnel first" body="Analytics come from the enquiries your funnel receives. Reserve a Launchpad build spot to get one." action={<Button onClick={() => openPath('/launchpad#apply')}>Reserve your build spot</Button>} />
          </div>
        ) : (
          <>
            <div className="mt-6 sm:mt-8">
              <Segmented<Range>
                label="Time range"
                value={range}
                onChange={setRange}
                options={[
                  { value: '7', label: '7 days' },
                  { value: '30', label: '30 days' },
                  { value: '90', label: '90 days' },
                ]}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <Tile label="Enquiries" value={current.length} sub={change === null ? `in the last ${days} days` : `${change >= 0 ? '+' : ''}${change}% on the ${days} days before`} tone={change !== null && change > 0 ? 'good' : undefined} />
              <Tile label="Ready now" value={current.filter((lead) => lead.segment === 'ready').length} sub={`of ${scored.length} scored`} tone={current.some((lead) => lead.segment === 'ready') ? 'good' : undefined} />
              <Tile label="Average score" value={average === null ? '—' : `${average}%`} sub={scored.length ? `across ${scored.length} scored` : 'no scorecard results yet'} />
              <Tile label="Delivered" value={current.length ? `${Math.round((delivered / current.length) * 100)}%` : '—'} sub={waiting ? `${waiting} waiting or failed` : 'every enquiry delivered'} tone={waiting ? 'warn' : undefined} />
            </div>

            <section className={`${CARD} mt-4 p-4 sm:p-5`} aria-label="Enquiries over time">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={LABEL}>Enquiries · {days > 30 ? 'per week' : 'per day'}</p>
                <ul className="flex flex-wrap gap-3 text-[12.5px] text-[var(--pg-body)]">
                  {SEGMENTS.slice(0, 3).map((segment) => (
                    <li key={segment.key} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${segment.bar}`} />{segment.name}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex h-[160px] items-end gap-1" role="img" aria-label={`${current.length} enquiries in the last ${days} days`}>
                {trend.map((bar) => (
                  <div key={bar.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${bar.label}: ${bar.total}`}>
                    <div className="flex flex-col-reverse overflow-hidden rounded-[3px]" style={{ height: `${(bar.total / peak) * 100}%` }}>
                      {SEGMENTS.map((segment, index) => bar.counts[index] > 0 && <div key={segment.key} className={segment.bar} style={{ flexGrow: bar.counts[index] }} />)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[12px] text-[var(--pg-body)]">
                <span>{trend[0]?.label}</span>
                <span>{trend[trend.length - 1]?.label}</span>
              </div>
              {current.length === 0 && <p className="mt-3 text-[14px] text-[var(--pg-body)]">No enquiries in this range yet. They appear here as people use your funnel.</p>}
            </section>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className={`${CARD} p-4 sm:p-5`} aria-label="How ready people are">
                <p className={LABEL}>How ready people are</p>
                <ul className="mt-4 space-y-3.5">
                  {SEGMENTS.map((segment) => {
                    const count = current.filter((lead) => segmentOf(lead) === segment.key).length;
                    const percent = current.length ? Math.round((count / current.length) * 100) : 0;
                    return (
                      <li key={segment.key}>
                        <div className="flex items-baseline justify-between text-[14.5px]">
                          <span className="font-medium">{segment.name}</span>
                          <span className="text-[var(--pg-body)]">{count} · {percent}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--pg-alt)]"><div className={`h-full rounded-full ${segment.bar}`} style={{ width: `${percent}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className={`${CARD} p-4 sm:p-5`} aria-label="By funnel">
                <p className={LABEL}>By funnel</p>
                <ul className="mt-2 divide-y divide-[var(--pg-line-soft)]">
                  {perFunnel.map((row) => (
                    <li key={row.funnel.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{row.funnel.label}</p>
                        <p className="text-[13.5px] text-[var(--pg-body)]">{row.funnel.scorecard ? 'Scorecard funnel' : 'Enquiry funnel'}</p>
                      </div>
                      <dl className="flex shrink-0 gap-5 text-right">
                        <div><dt className="text-[12px] text-[var(--pg-body)]">Enquiries</dt><dd className="font-semibold">{row.total}</dd></div>
                        <div><dt className="text-[12px] text-[var(--pg-body)]">Ready</dt><dd className="font-semibold">{row.ready}</dd></div>
                        <div className="hidden sm:block"><dt className="text-[12px] text-[var(--pg-body)]">Avg score</dt><dd className="font-semibold">{row.average === null ? '—' : `${row.average}%`}</dd></div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </PageContainer>
    </LearnerLayout>
  );
}
