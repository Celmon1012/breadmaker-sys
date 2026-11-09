import React, { useEffect, useState } from 'react';
import { LaunchMetrics as Metrics, MetricValue, loadLaunchMetrics, rate } from '../../lib/metrics';
import { CARD, Loading, Notice, Select } from './lms-ui';

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

/** "up 3 on the 5 before", or nothing at all when neither period has any data. */
function change(value: MetricValue): string {
  if (value.current === 0 && value.previous === 0) return 'no activity yet';
  const diff = value.current - value.previous;
  if (diff === 0) return `same as the ${value.previous} before`;
  return `${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} on the ${value.previous} before`;
}

function Tile({ label, value, note }: { label: string; value: MetricValue; note: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--pg-alt)]/50 px-4 py-3">
      <p className="font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]">{label}</p>
      <p className="mt-1 font-editorial text-[32px] font-semibold leading-none">{value.current}</p>
      <p className="mt-2 text-[12.5px] leading-[1.4] text-[var(--pg-body)]">{note}</p>
    </div>
  );
}

function Step({ rateValue, label }: { rateValue: number | null; label: string }) {
  return (
    <div className="flex items-center justify-center text-center text-[12.5px] leading-[1.35] text-[var(--pg-body)]">
      <span>
        <span className="block text-[17px] font-semibold text-[var(--pg-ink)]">{rateValue === null ? '—' : `${rateValue}%`}</span>
        {label}
      </span>
    </div>
  );
}

/**
 * The five launch numbers, as two funnels: Leak Test starts, completions and report purchases; application
 * form opens, applications and paid enrolments. Each step shows what share of the one before it got through.
 * Visits are counted once per browser per day, so the first rate is people, not clicks.
 */
export default function LaunchMetrics() {
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMetrics(null);
    setError(null);
    loadLaunchMetrics(days)
      .then((value) => !cancelled && setMetrics(value))
      .catch((err: Error) => !cancelled && setError(/launch_metrics|does not exist|schema cache/i.test(err.message) ? 'Launch metrics are not set up yet. Run migration 55 (launch_metrics) in the SQL editor.' : err.message));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const applications = metrics ? { current: metrics.application_foundry.current + metrics.application_launchpad.current, previous: metrics.application_foundry.previous + metrics.application_launchpad.previous } : null;
  const opens = metrics ? { current: metrics.foundry_apply_start.current + metrics.launchpad_apply_start.current, previous: metrics.foundry_apply_start.previous + metrics.launchpad_apply_start.previous } : null;

  return (
    <section className={`${CARD} mb-8 p-6`} aria-labelledby="launch-metrics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="launch-metrics" className="font-editorial text-[22px] font-semibold">Launch metrics</h2>
        <Select value={String(days)} onChange={(event) => setDays(Number(event.target.value))} className="max-w-[170px]" aria-label="Period">
          {RANGES.map((range) => (
            <option key={range.days} value={range.days}>{range.label}</option>
          ))}
        </Select>
      </div>

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {!error && !metrics && <Loading />}

      {metrics && applications && opens && (
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 text-[14px] font-semibold">Leak Test</h3>
            <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <Tile label="Started" value={metrics.leaktest_start} note={change(metrics.leaktest_start)} />
              <Step rateValue={rate(metrics.leaktest_complete.current, metrics.leaktest_start.current)} label="finish" />
              <Tile label="Completed" value={metrics.leaktest_complete} note={change(metrics.leaktest_complete)} />
              <Step rateValue={rate(metrics.report_purchase.current, metrics.leaktest_complete.current)} label="buy" />
              <Tile label="Report bought" value={metrics.report_purchase} note={change(metrics.report_purchase)} />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-[14px] font-semibold">Foundry and Launchpad</h3>
            <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <Tile label="Form opened" value={opens} note={change(opens)} />
              <Step rateValue={rate(applications.current, opens.current)} label="apply" />
              <Tile label="Applications" value={applications} note={`${metrics.application_foundry.current} Foundry, ${metrics.application_launchpad.current} Launchpad`} />
              <Step rateValue={rate(metrics.paid_enrolment.current, applications.current)} label="pay" />
              <Tile label="Paid enrolments" value={metrics.paid_enrolment} note={change(metrics.paid_enrolment)} />
            </div>
          </div>
        </div>
      )}

      {metrics && (
        <p className="mt-4 text-[13px] leading-[1.5] text-[var(--pg-body)]">
          Starts and form opens count a visitor once a day and only from the day migration 55 was applied. Completions, purchases, applications and paid enrolments are counted from their own records. Paid enrolments include any paid course or kit, not only people who applied.
        </p>
      )}
    </section>
  );
}
