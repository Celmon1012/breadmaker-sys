import React, { useEffect, useState } from 'react';
import { Route } from '../types';
import { ANSWERS, BAND_COPY, LEAK_AREAS, LeakResult, OWNER_QUESTION_INDEXES, QUESTIONS, rankLeaks, scoreLeakTest } from '../lib/leak-test';
import { Access, ProfileNote, ReportContent, StoredResult, accessFromUrl, getLeakReport, getLeakTest } from '../lib/leak-test-api';
import { CallCard, PersonalSection } from './LeakTestPersonal';

/**
 * The paid Business Leak Test report. Its text comes from the database, which
 * only returns it once the result is unlocked (paid or code). "Download PDF"
 * uses the browser's print dialog with a print-friendly layout.
 */

interface LeakTestReportProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

const PAPER = 'rounded-[11px] bg-[var(--pg-card)] p-7 text-[var(--pg-ink)] border border-[var(--pg-line-soft)] sm:p-12 print:rounded-none print:p-0 print:shadow-none';
const MUTED = 'text-[var(--pg-body)]';
const H2 = 'mt-12 font-editorial text-[26px] font-semibold tracking-[-0.01em] sm:text-[30px] break-after-avoid';
const SHORT_NAMES = ['Offer', 'Sales', 'Operations', 'Cash', 'Team', 'Tech'];

type PillarContent = { low: string; ok: string; plan: string[] };

const PROFILE_LABEL: Record<ProfileNote['dimension'], string> = {
  main_goal: 'Your goal',
  team_size: 'Your team',
  revenue_band: 'Your revenue',
  business_age: 'Your stage',
  industry: 'Your industry',
};

export default function LeakTestReport({ onNavigate, openPath }: LeakTestReportProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'locked' | 'missing'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredResult | null>(null);
  const [report, setReport] = useState<ReportContent | null>(null);
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    const access = accessFromUrl();
    setAccess(access);
    if (!access) {
      setState('missing');
      return;
    }
    (async () => {
      try {
        const found = await getLeakTest(access);
        if (!found) {
          setState('missing');
          return;
        }
        setStored(found);
        if (!found.paid_tier) {
          setState('locked');
          return;
        }
        setReport(await getLeakReport(access));
        setState('ready');
      } catch (err) {
        setError((err as Error).message);
        setState('missing');
      }
    })();
  }, []);

  // While the personal plan is being written, ask again every few seconds until it lands.
  const aiStatus = report?.ai_status;
  useEffect(() => {
    if (!access || (aiStatus !== 'pending' && aiStatus !== 'generating')) return;
    const timer = window.setInterval(() => {
      getLeakReport(access).then(setReport).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [access, aiStatus]);

  if (state === 'loading') return <p className="pt-24 text-[18px] text-[var(--pg-body)]">Loading your report…</p>;

  if (state === 'missing' || state === 'locked' || !stored || !report) {
    const access = accessFromUrl();
    return (
      <section className="pt-20">
        <h1 className="font-editorial text-[36px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[46px]">
          {state === 'locked' ? 'Your report is locked.' : 'We could not open that report.'}
        </h1>
        <p className="mt-5 max-w-[600px] text-[18px] leading-[1.55] text-[var(--pg-body)]">
          {state === 'locked'
            ? 'Unlock the full report from your result page, with a payment or a code.'
            : (error ?? 'The link may be incomplete. Use the link in your email, or take the test again.')}
        </p>
        <button
          onClick={() => openPath(access ? `/leak-test/result?s=${access.id}&t=${access.token}` : '/leak-test')}
          className="mt-8 inline-flex items-center justify-center rounded-full bg-[var(--pg-accent)] px-8 py-4 text-[17px] font-medium text-[var(--pg-accent-ink)] cursor-pointer"
        >
          {state === 'locked' ? 'Go to my result' : 'Take the test'}
        </button>
      </section>
    );
  }

  const result = scoreLeakTest(stored.answers);
  const ranked = rankLeaks(result);
  const band = BAND_COPY[result.band];
  const content = report.content as Record<string, Record<string, unknown>>;
  const pillar = (id: string) => content[`pillar:${id}`] as unknown as PillarContent | undefined;
  const cover = (content[`archetype:${result.archetype.id}`]?.cover as string | undefined) ?? '';
  const owner = content.owner_dependence as { title?: string; body?: string; low?: string } | undefined;
  const bench = report.benchmark;
  const notes = report.profile_notes ?? [];
  const focusId = notes.find((n) => n.dimension === 'main_goal')?.focus;
  const topTwo = ranked.slice(0, 2);
  // The goal's pillar joins the plan when it is not already one of the two weakest.
  const goalArea = focusId && !topTwo.some((r) => r.area.id === focusId) ? ranked.find((r) => r.area.id === focusId) : undefined;
  const planAreas = goalArea ? [...topTwo, goalArea] : topTwo;
  const boostFor = (areaId: string) => notes.filter((n) => n.boost?.[areaId]).map((n) => n.boost![areaId]);
  const refresh = () => (access ? getLeakReport(access).then(setReport) : Promise.resolve());

  return (
    <article className={`${PAPER} mt-10`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as React.CSSProperties}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Breadmaker Business Leak Test · Full report</p>
          <h1 className="mt-3 font-editorial text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[42px]">
            {stored.name.split(' ')[0]}, here is where your business leaks.
          </h1>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-full bg-[var(--pg-dark)] px-6 py-3 text-[15px] font-medium text-[var(--pg-dark-ink)] cursor-pointer print:hidden"
        >
          Download PDF
        </button>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <p className="font-editorial text-[88px] font-semibold leading-none tracking-[-0.04em] sm:text-[120px]">
          {result.total}
          <span className={`text-[32px] sm:text-[44px] ${MUTED}`}>/100</span>
        </p>
        <div>
          <p className="text-[24px] font-bold">{band.title}</p>
          <p className={`mt-1 text-[17px] leading-[1.55] ${MUTED}`}>{band.body}</p>
          <p className="mt-3 text-[16px]">
            Archetype: <strong>{result.archetype.name}</strong> · Biggest leak: <strong>{result.leakiest.area.name}</strong>
          </p>
        </div>
      </div>

      {access && (
        <PersonalSection access={access} report={report} ranked={ranked.map((r) => ({ id: r.area.id, name: r.area.name }))} onChange={refresh} />
      )}

      <h2 className={H2}>Your six pillars</h2>
      <div className="mt-4 grid items-center gap-8 sm:grid-cols-[360px_1fr]">
        <Radar scores={result.areas.map((a) => a.score)} benchmark={bench.ready ? bench.pillars : null} />
        <ul className="space-y-3 text-[16px]">
          {result.areas.map(({ area, score }, i) => (
            <li key={area.id} className="flex items-baseline justify-between gap-4 border-b border-[var(--pg-line-soft)] pb-2">
              <span className="font-semibold">{SHORT_NAMES[i]}</span>
              <span>
                {score}/100
                {bench.ready && <span className={`ml-2 text-[14px] ${MUTED}`}>(avg {bench.pillars[i]})</span>}
              </span>
            </li>
          ))}
          {bench.ready && <li className={`text-[13px] ${MUTED}`}>The dashed line on the chart is the average for {bench.scope === 'industry' ? `${bench.industry} businesses` : 'all businesses'}.</li>}
        </ul>
      </div>

      <h2 className={H2}>Your leaks, ranked</h2>
      <p className={`mt-2 text-[16px] ${MUTED}`}>Weakest first. Fix them in this order.</p>
      <ol className="mt-6 space-y-6">
        {ranked.map(({ area, score }, i) => {
          const text = pillar(area.id);
          return (
            <li key={area.id} className="break-inside-avoid">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[19px] font-bold">
                  {i + 1}. {area.name}
                </p>
                <p className="text-[16px] font-semibold">{score}/100</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--pg-alt)]">
                <div className="h-full bg-[var(--pg-accent)]" style={{ width: `${score}%` }} />
              </div>
              {text && <p className={`mt-3 text-[16px] leading-[1.65] ${MUTED}`}>{score < 50 ? text.low : text.ok}</p>}
            </li>
          );
        })}
      </ol>

      {notes.length > 0 && (
        <>
          <h2 className={H2}>What this means for your business</h2>
          <p className={`mt-2 text-[16px] ${MUTED}`}>Based on your goal, team, revenue, age and industry.</p>
          <ul className="mt-5 space-y-4">
            {notes.map((n) => (
              <li key={n.dimension} className="break-inside-avoid rounded-[12px] border border-[var(--pg-line-soft)] p-5">
                <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">
                  {PROFILE_LABEL[n.dimension]}: {n.option}
                </p>
                <p className="mt-2 text-[16px] leading-[1.65]">{n.note}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className={H2}>Your 30-day fix plan</h2>
      <p className={`mt-2 text-[16px] ${MUTED}`}>
        For your top two leaks: {ranked[0].area.name} and {ranked[1].area.name}
        {goalArea ? `, plus ${goalArea.area.name} because of your goal` : ''}. Do them in order, one action at a time.
      </p>
      <div className={`mt-6 grid gap-6 md:grid-cols-2 ${goalArea ? 'lg:grid-cols-3' : ''}`}>
        {planAreas.map(({ area }) => {
          const actions = pillar(area.id)?.plan ?? [];
          const shown = area.id === goalArea?.area.id ? actions.slice(0, 2) : actions;
          const extra = boostFor(area.id);
          return (
            <div key={area.id} className="break-inside-avoid rounded-[14px] border border-[var(--pg-line-soft)] p-6">
              <p className="text-[18px] font-bold">{area.name}</p>
              <ol className="mt-4 space-y-4">
                {shown.map((action, i) => (
                  <li key={i} className="flex gap-3 text-[16px] leading-[1.6]">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--pg-dark)] text-[13px] font-semibold text-[var(--pg-dark-ink)]">{i + 1}</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ol>
              {extra.length > 0 && (
                <div className="mt-5 border-t border-[var(--pg-line-soft)] pt-4">
                  <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Tailored for you</p>
                  <ul className="mt-3 space-y-3">
                    {extra.map((text, i) => (
                      <li key={i} className="text-[15.5px] leading-[1.6]">{text}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className={H2}>Your archetype: {result.archetype.name}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="break-inside-avoid rounded-[14px] border border-[var(--pg-line-soft)] p-6">
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Superpower</p>
          <p className="mt-2 text-[16px] leading-[1.6]">{result.archetype.superpower}</p>
        </div>
        <div className="break-inside-avoid rounded-[14px] border border-[var(--pg-line-soft)] p-6">
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Blind spot</p>
          <p className="mt-2 text-[16px] leading-[1.6]">{result.archetype.blindSpot}</p>
        </div>
      </div>
      {cover && (
        <p className="mt-4 text-[16px] leading-[1.65]">
          <strong>How to cover it: </strong>
          <span className={MUTED}>{cover}</span>
        </p>
      )}

      <OwnerDependence result={result} answers={stored.answers} owner={owner} />

      <h2 className={H2}>Businesses like yours</h2>
      {bench.ready ? (
        <p className={`mt-3 text-[16px] leading-[1.65] ${MUTED}`}>
          Compared with {bench.count} {bench.scope === 'industry' ? `${bench.industry} businesses` : 'businesses'} that took the test. Your
          overall score is {result.total}; the average is {bench.total}. Pillars where you are below the average are the dashed-line gaps on the chart.
        </p>
      ) : (
        <p className={`mt-3 text-[16px] leading-[1.65] ${MUTED}`}>
          Benchmarks appear once enough businesses in your industry have taken the test, so the comparison means something. {bench.count} so far. Open this link
          again later and it will be here.
        </p>
      )}

      <div className="mt-12 rounded-[17px] bg-[var(--pg-dark)] p-7 text-[var(--pg-dark-ink)] sm:p-9 print:hidden">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-label-dark)]">Next step</p>
        <h2 className="mt-3 text-[26px] font-bold leading-[1.15]">Want these leaks fixed for you?</h2>
        <p className="mt-3 max-w-[620px] text-[16px] leading-[1.6] text-[var(--pg-dark-body)]">
          Launchpad and Foundry fix these leaks with guidance, one step at a time. Or talk to us about doing it with you.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => onNavigate('home')} className="rounded-full bg-[var(--pg-accent)] px-7 py-3.5 text-[16px] font-medium text-[var(--pg-accent-ink)] cursor-pointer">
            See the builds
          </button>
          <button onClick={() => onNavigate('contact')} className="rounded-full border border-white/20 px-7 py-3.5 text-[16px] font-medium cursor-pointer">
            Talk to us
          </button>
        </div>
        {report.paid_tier === 'report_call' && <CallCard call={report.call} contact={report.contact} submissionId={access?.id ?? ''} />}
      </div>

      <p className={`mt-10 text-[13px] leading-[1.6] ${MUTED}`}>
        This report is a self-assessment based on your own answers. It is not a financial or legal audit and it does not
        promise any result. Breadmaker Systems is a Restart Integrated Systems Ltd. company.
      </p>
    </article>
  );
}

function OwnerDependence({
  result,
  answers,
  owner,
}: {
  result: LeakResult;
  answers: number[];
  owner?: { title?: string; body?: string; low?: string };
}) {
  return (
    <>
      <h2 className={H2}>{owner?.title ?? 'Owner dependence'}</h2>
      <p className="mt-3 font-editorial text-[34px] font-semibold tracking-[-0.02em]">
        {result.ownerDependence}
        <span className={`text-[20px] ${MUTED}`}>/16</span>
      </p>
      {owner?.body && <p className={`mt-2 text-[16px] leading-[1.65] ${MUTED}`}>{owner.body}</p>}
      <ul className="mt-5 space-y-3">
        {OWNER_QUESTION_INDEXES.map((index) => (
          <li key={index} className="flex items-baseline justify-between gap-4 border-b border-[var(--pg-line-soft)] pb-2 text-[16px]">
            <span>{QUESTIONS[index].text}</span>
            <span className="shrink-0 font-semibold">{ANSWERS[answers[index] ?? 0].label}</span>
          </li>
        ))}
      </ul>
      {result.ownerDependent && owner?.low && (
        <p className="mt-5 rounded-[12px] border border-[var(--pg-accent)] p-4 text-[16px] leading-[1.6]">
          <strong>Warning. </strong>
          {owner.low}
        </p>
      )}
    </>
  );
}

/** A six-axis radar chart in SVG. The dashed line is the benchmark, when there is one. */
function Radar({ scores, benchmark }: { scores: number[]; benchmark: number[] | null }) {
  const size = 360;
  const c = size / 2;
  const r = 118;
  const point = (value: number, i: number, scale = 1) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    const radius = (value / 100) * r * scale;
    return [c + radius * Math.cos(angle), c + radius * Math.sin(angle)] as const;
  };
  const poly = (values: number[]) => values.map((v, i) => point(v, i).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[360px]" role="img" aria-label="Radar chart of your six pillar scores">
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={poly(Array(6).fill(ring))} fill="none" stroke="#DDD6C4" strokeWidth="1" />
      ))}
      {scores.map((_, i) => {
        const [x, y] = point(100, i);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#DDD6C4" strokeWidth="1" />;
      })}
      {benchmark && <polygon points={poly(benchmark)} fill="none" stroke="#5B544A" strokeWidth="1.5" strokeDasharray="5 4" />}
      <polygon points={poly(scores)} fill="#A24712" fillOpacity="0.22" stroke="#A24712" strokeWidth="2.5" />
      {scores.map((s, i) => {
        const [x, y] = point(s, i);
        return <circle key={i} cx={x} cy={y} r="4" fill="#A24712" />;
      })}
      {SHORT_NAMES.map((name, i) => {
        const [x, y] = point(100, i, 1.2);
        return (
          <text key={name} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="600" fill="#1E1B16">
            {name}
          </text>
        );
      })}
    </svg>
  );
}
