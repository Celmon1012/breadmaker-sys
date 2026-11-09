import { supabase } from './supabase';

/**
 * Agent runs: what the agent platform (agent-platform/) did, read from breadmaker.agent_runs under row level security
 * (the team reads them), and the call that starts a new run. The platform checks the signed-in team member itself.
 */

export const AGENT_PLATFORM_URL = ((import.meta.env.VITE_AGENT_PLATFORM_URL as string | undefined) || 'https://agents.restart.ng').replace(/\/+$/, '');

/**
 * The signed-in person's token for the agent platform. A page left open for a while can hold a token that is about to
 * expire; the platform would refuse it. So when it has under two minutes left, refresh it first.
 */
export async function freshToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (session?.expires_at && session.expires_at * 1000 - Date.now() < 120_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed.session ?? session;
  }
  return session?.access_token ?? null;
}

export type RunStatus = 'running' | 'completed' | 'failed';

export interface ToolCall {
  name: string;
  input: string;
  output: string | null;
  error: boolean;
}

export interface AgentRun {
  id: string;
  agent: string;
  trigger: 'console' | 'schedule' | 'api';
  status: RunStatus;
  input: string;
  output: string | null;
  toolCalls: ToolCall[];
  steps: number;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number | null;
  agentId: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface RunRow {
  id: string;
  agent: string;
  trigger: AgentRun['trigger'];
  status: RunStatus;
  input: string;
  output: string | null;
  tool_calls: ToolCall[] | null;
  steps: number;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | string;
  duration_ms: number | null;
  agent_id: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

const toRun = (row: RunRow): AgentRun => ({
  id: row.id,
  agent: row.agent,
  trigger: row.trigger,
  status: row.status,
  input: row.input,
  output: row.output,
  toolCalls: Array.isArray(row.tool_calls) ? row.tool_calls : [],
  steps: row.steps,
  model: row.model,
  tokensIn: row.tokens_in,
  tokensOut: row.tokens_out,
  costUsd: Number(row.cost_usd) || 0,
  durationMs: row.duration_ms,
  agentId: row.agent_id ?? null,
  error: row.error,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

/** What the signed-in member's own agents have cost this calendar month (UTC), in dollars. */
export async function mySpendThisMonth(): Promise<number> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return 0;
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase.from('agent_runs').select('cost_usd').eq('owner_id', auth.user.id).gte('started_at', since.toISOString()).limit(5000);
  if (error) throw error;
  return (data ?? []).reduce((sum: number, row: { cost_usd: number | string }) => sum + (Number(row.cost_usd) || 0), 0);
}

export async function loadRuns(limit = 60): Promise<AgentRun[]> {
  // The team's runs. A member's runs (owner_id set) are theirs alone.
  let { data, error } = await supabase.from('agent_runs').select('*').is('owner_id', null).order('started_at', { ascending: false }).limit(limit);
  // Before migration 67 the column does not exist yet: carry on without the filter rather than break the page.
  if (error && error.code === '42703') ({ data, error } = await supabase.from('agent_runs').select('*').order('started_at', { ascending: false }).limit(limit));
  if (error) throw error;
  return ((data ?? []) as RunRow[]).map(toRun);
}

/** The runs of one stored agent (its own page), newest first. */
export async function loadRunsFor(agentId: string, limit = 40): Promise<AgentRun[]> {
  const { data, error } = await supabase.from('agent_runs').select('*').eq('agent_id', agentId).order('started_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data ?? []) as RunRow[]).map(toRun);
}

/** A real run: not a preview in the builder and not a test. Those are tracked separately so they do not skew an agent's numbers. */
export const isRealRun = (run: AgentRun) => !run.agent.startsWith('preview:') && !run.agent.startsWith('eval:');

export interface WeekStats {
  runs: number;
  failed: number;
  successPct: number | null;
  avgMs: number | null;
  costUsd: number;
}

/** Numbers for real runs that started between `toDaysAgo` and `fromDaysAgo` days ago (0 and 7 is the last week). */
export function weekStats(runs: AgentRun[], fromDaysAgo: number, toDaysAgo: number, now = Date.now()): WeekStats {
  const DAY = 86_400_000;
  const inRange = runs.filter((run) => {
    const age = now - new Date(run.startedAt).getTime();
    return isRealRun(run) && age >= fromDaysAgo * DAY && age < toDaysAgo * DAY;
  });
  const done = inRange.filter((run) => run.status !== 'running');
  const times = inRange.map((run) => run.durationMs).filter((ms): ms is number => typeof ms === 'number');
  return {
    runs: inRange.length,
    failed: inRange.filter((run) => run.status === 'failed').length,
    successPct: done.length ? Math.round((done.filter((run) => run.status === 'completed').length / done.length) * 100) : null,
    avgMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    costUsd: inRange.reduce((sum, run) => sum + run.costUsd, 0),
  };
}

/** "+3 vs the week before", or nothing when there is nothing to compare with. */
export function change(now: number | null, before: number | null, format: (n: number) => string, suffix = 'vs the week before'): string | undefined {
  if (now === null || before === null || (before === 0 && now === 0)) return undefined;
  const diff = now - before;
  if (diff === 0) return `same ${suffix}`;
  return `${diff > 0 ? '+' : '−'}${format(Math.abs(diff))} ${suffix}`;
}

export interface RunMetrics {
  runs: number;
  failed: number;
  avgMs: number | null;
  p95Ms: number | null;
  tokens: number;
  costUsd: number;
  perDay: { day: string; runs: number; failed: number }[];
  byTool: { name: string; calls: number; errors: number }[];
}

/** Metrics over runs, for the last `days` days. Computed here from the rows: the table is the source of truth. */
export function summarise(runs: AgentRun[], days = 7, now = new Date()): RunMetrics {
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  const inRange = runs.filter((run) => new Date(run.startedAt) >= since);
  const durations = inRange.map((run) => run.durationMs).filter((ms): ms is number => typeof ms === 'number').sort((a, b) => a - b);
  const perDay = Array.from({ length: days }, (_, index) => {
    const day = new Date(since);
    day.setDate(since.getDate() + index);
    const key = day.toDateString();
    const dayRuns = inRange.filter((run) => new Date(run.startedAt).toDateString() === key);
    return { day: day.toLocaleDateString(undefined, { weekday: 'short' }), runs: dayRuns.length, failed: dayRuns.filter((run) => run.status === 'failed').length };
  });
  const tools = new Map<string, { calls: number; errors: number }>();
  for (const run of inRange) {
    for (const call of run.toolCalls) {
      const entry = tools.get(call.name) ?? { calls: 0, errors: 0 };
      entry.calls += 1;
      if (call.error) entry.errors += 1;
      tools.set(call.name, entry);
    }
  }
  return {
    runs: inRange.length,
    failed: inRange.filter((run) => run.status === 'failed').length,
    avgMs: durations.length ? Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length) : null,
    p95Ms: durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)] : null,
    tokens: inRange.reduce((sum, run) => sum + run.tokensIn + run.tokensOut, 0),
    costUsd: inRange.reduce((sum, run) => sum + run.costUsd, 0),
    perDay,
    byTool: [...tools.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.calls - a.calls),
  };
}

export interface ModelStatus {
  id: string;
  provider: string;
  name: string;
  blurb: string;
  speed: number;
  quality: number;
  cost: number;
  recommended: boolean;
  /** Can it be used now (its provider is connected)? */
  available: boolean;
  /** The setting that connects its provider, when it is not. */
  needs: string | null;
  /** Is the cost estimate based on a price that was set, rather than the rough global one? */
  priceKnown: boolean;
}

export interface PlatformStatus {
  supabase: boolean;
  coolify: boolean;
  anthropic: boolean;
  platformToken: boolean;
  model: string;
  maxDailyUsd: number;
  /** What one member's own agents may spend a month. */
  memberMonthlyUsd?: number;
  paused: boolean;
  agents: { id: string; name: string; summary: string; tools: string[]; suggestions: string[] }[];
  tools: { id: string; system: string; risk: string; summary: string }[];
  models?: ModelStatus[];
  /** Tools the platform is not offering to agents, and why. */
  problems?: { id: string; reason: string }[];
}

export async function loadPlatformStatus(): Promise<PlatformStatus> {
  const response = await fetch(`${AGENT_PLATFORM_URL}/status`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`The agent platform answered ${response.status}.`);
  return (await response.json()) as PlatformStatus;
}

/** Start a run. The platform answers at once with the run's id; the run itself appears in the list and fills in as it works. */
export async function startRun(input: string, agentId?: string): Promise<string> {
  const token = await freshToken();
  if (!token) throw new Error('Sign in again to ask an agent.');
  const response = await fetch(`${AGENT_PLATFORM_URL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(agentId ? { agentId, input } : { agent: 'ops', input }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json().catch(() => ({}))) as { runId?: string; error?: string };
  if (!response.ok || !body.runId) throw new Error(body.error || `The agent platform answered ${response.status}.`);
  return body.runId;
}

export const formatDuration = (ms: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)} m ${Math.round((ms % 60_000) / 1000)} s`);
export const formatCost = (usd: number) => (usd === 0 ? '$0' : usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`);
export const formatTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function timeAgo(value: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
