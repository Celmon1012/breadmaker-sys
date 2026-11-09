// Launch measurement: the visitor side (events) and the team side (the numbers).
//
// trackEvent() records that this browser session reached the top of a funnel: it started the Leak Test or
// opened an application form. The database counts a session once per event per day. It never blocks or
// fails a page. loadLaunchMetrics() is for the Studio and is refused for anyone who is not on the team.
import { supabase } from './supabase';

export type TrackedEvent = 'leaktest_start' | 'foundry_apply_start' | 'launchpad_apply_start';

const KEY = 'bm_session_v1';

/** A random id for this browser, kept so repeat visits on the same day count once. Not tied to a person. */
function sessionId(): string {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved && saved.length >= 8) return saved;
    const fresh = (window.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, '').slice(0, 64);
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private windows and blocked storage: a per-page id still counts the visit once.
    return `tmp${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(0, 64);
  }
}

/** Fire and forget. */
export function trackEvent(name: TrackedEvent): void {
  try {
    if (typeof window === 'undefined') return;
    void supabase.rpc('track_event', { p_name: name, p_session: sessionId() }).then(() => undefined, () => undefined);
  } catch {
    // measurement must never break a page
  }
}

export type MetricKey =
  | 'leaktest_start'
  | 'leaktest_complete'
  | 'report_purchase'
  | 'foundry_apply_start'
  | 'application_foundry'
  | 'launchpad_apply_start'
  | 'application_launchpad'
  | 'paid_enrolment';

export interface MetricValue {
  current: number;
  previous: number;
}

export type LaunchMetrics = Record<MetricKey, MetricValue>;

const KEYS: MetricKey[] = [
  'leaktest_start',
  'leaktest_complete',
  'report_purchase',
  'foundry_apply_start',
  'application_foundry',
  'launchpad_apply_start',
  'application_launchpad',
  'paid_enrolment',
];

/** The last `days` days against the `days` before them. Throws if the migration is not applied or the caller is not on the team. */
export async function loadLaunchMetrics(days: number): Promise<LaunchMetrics> {
  const { data, error } = await supabase.rpc('launch_metrics', { p_days: days });
  if (error) throw new Error(error.message);
  const out = Object.fromEntries(KEYS.map((key) => [key, { current: 0, previous: 0 }])) as LaunchMetrics;
  for (const row of (data ?? []) as { metric: string; current_count: number | string; previous_count: number | string }[]) {
    if ((KEYS as string[]).includes(row.metric)) {
      out[row.metric as MetricKey] = { current: Number(row.current_count), previous: Number(row.previous_count) };
    }
  }
  return out;
}

/** a as a share of b, as a whole percent. null when there is nothing to divide by. */
export function rate(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 100) : null;
}
