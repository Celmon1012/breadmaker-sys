// Supabase REST, with the service role: run records are written here, and funnel status is read here. The platform
// is the only holder of the service key; people reach runs through the studio, under row level security.
import { config } from './config.ts';

const headers = (extra: Record<string, string> = {}) => ({
  apikey: config.supabaseServiceKey,
  Authorization: `Bearer ${config.supabaseServiceKey}`,
  'Accept-Profile': 'breadmaker',
  'Content-Profile': 'breadmaker',
  'Content-Type': 'application/json',
  ...extra,
});

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!config.supabaseUrl || !config.supabaseServiceKey) throw new Error('Supabase is not set up on the agent platform.');
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${body.slice(0, 300)}`);
  return (body ? JSON.parse(body) : null) as T;
}

export interface RunRow {
  id: string;
  tenant: string;
  agent: string;
  trigger: string;
  status: 'running' | 'completed' | 'failed';
  input: string;
  output: string | null;
  tool_calls: unknown[];
  steps: number;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  duration_ms: number | null;
  error: string | null;
  requested_by: string | null;
  owner_id?: string | null;
}

export const createRun = async (row: Pick<RunRow, 'agent' | 'trigger' | 'input' | 'model'> & { requested_by: string | null; tenant?: string; agent_id?: string | null; owner_id?: string | null }) =>
  (await rest<RunRow[]>('agent_runs', { method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(row) }))[0];

export const finishRun = (id: string, patch: Partial<RunRow> & { finished_at: string }) =>
  rest<null>(`agent_runs?id=eq.${id}`, { method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(patch) });

/** Money spent since midnight UTC, for the daily cap. */
export async function spentToday(): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const rows = await rest<{ cost_usd: number }[]>(`agent_runs?select=cost_usd&started_at=gte.${since.toISOString()}`, { headers: headers() });
  return rows.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0);
}

/** Money one member's agents have spent this calendar month (UTC), for their allowance. */
export async function spentThisMonthBy(userId: string): Promise<number> {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await rest<{ cost_usd: number }[]>(`agent_runs?select=cost_usd&owner_id=eq.${encodeURIComponent(userId)}&started_at=gte.${since.toISOString()}&limit=5000`, { headers: headers() });
  return rows.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0);
}

/** A run left "running" by a restart can never finish: mark it failed so the list stays honest. */
export const failStaleRuns = () =>
  rest<null>(`agent_runs?status=eq.running&started_at=lt.${new Date(Date.now() - 10 * 60_000).toISOString()}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ status: 'failed', error: 'The platform restarted or the run timed out.', finished_at: new Date().toISOString() }),
  });

export interface StoredDef {
  id: string;
  name: string;
  public_name: string;
  opening_message: string;
  purpose: string;
  model: string;
  instructions: string;
  rules: string[];
  tools: string[];
  status: string;
  owner_id?: string | null;
}

export const getAgentDef = async (id: string) =>
  (await rest<StoredDef[]>(`agent_defs?id=eq.${encodeURIComponent(id)}&select=*`, { headers: headers() }))[0] ?? null;

export const getLatestVersion = async (agentId: string) =>
  (
    await rest<{ version: number; snapshot: Record<string, unknown> }[]>(`agent_def_versions?agent_id=eq.${encodeURIComponent(agentId)}&select=version,snapshot&order=version.desc&limit=1`, {
      headers: headers(),
    })
  )[0] ?? null;

export interface KnowledgeSource {
  id: string;
  agent_id: string;
  name: string;
  kind: 'text' | 'url';
  url: string | null;
  status: 'ready' | 'failed';
  error: string | null;
  chunk_count: number;
  chars: number;
}

export const createSource = async (row: { agent_id: string; name: string; kind: 'text' | 'url'; url: string | null; created_by: string | null }) =>
  (await rest<KnowledgeSource[]>('agent_knowledge_sources', { method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(row) }))[0];

export const getSource = async (id: string) =>
  (await rest<KnowledgeSource[]>(`agent_knowledge_sources?id=eq.${encodeURIComponent(id)}&select=*`, { headers: headers() }))[0] ?? null;

export const finishSource = (id: string, patch: Partial<Pick<KnowledgeSource, 'status' | 'error' | 'chunk_count' | 'chars'>>) =>
  rest<null>(`agent_knowledge_sources?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });

export const insertChunks = async (rows: { source_id: string; agent_id: string; position: number; content: string }[]) => {
  // In batches, so a long page does not make one huge request.
  for (let i = 0; i < rows.length; i += 100) {
    await rest<null>('agent_knowledge_chunks', { method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(rows.slice(i, i + 100)) });
  }
};

export const deleteChunksOf = (sourceId: string) =>
  rest<null>(`agent_knowledge_chunks?source_id=eq.${encodeURIComponent(sourceId)}`, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });

/** How much knowledge an agent has: its sources, and the passages across them. */
export async function countKnowledge(agentId: string): Promise<{ sources: number; chunks: number }> {
  const sources = await rest<{ chunk_count: number }[]>(`agent_knowledge_sources?agent_id=eq.${encodeURIComponent(agentId)}&select=chunk_count`, { headers: headers() });
  return { sources: sources.length, chunks: sources.reduce((sum, row) => sum + (row.chunk_count || 0), 0) };
}

/** Does this agent have any passages to search? A cheap check made before each run. */
export async function hasKnowledge(agentId: string): Promise<boolean> {
  const rows = await rest<{ id: string }[]>(`agent_knowledge_chunks?agent_id=eq.${encodeURIComponent(agentId)}&select=id&limit=1`, { headers: headers() }).catch(() => []);
  return rows.length > 0;
}

export const searchKnowledge = (agentId: string, query: string) =>
  rest<{ source_name: string; content: string; rank: number }[]>('rpc/search_knowledge', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_agent: agentId, p_query: query, p_limit: 5 }),
  });

export const getRun = async (id: string) =>
  (await rest<RunRow[]>(`agent_runs?id=eq.${encodeURIComponent(id)}&select=*`, { headers: headers() }))[0] ?? null;

export interface ApprovalRow {
  id: string;
  run_id: string | null;
  agent_id: string | null;
  agent_name: string;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  status: 'pending' | 'rejected' | 'approved' | 'executed' | 'failed';
  decided_by: string | null;
  result: string | null;
}

export const createApproval = async (row: Pick<ApprovalRow, 'run_id' | 'agent_id' | 'agent_name' | 'tool' | 'input' | 'summary'>) =>
  (await rest<ApprovalRow[]>('agent_approvals', { method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(row) }))[0];

export const getApproval = async (id: string) =>
  (await rest<ApprovalRow[]>(`agent_approvals?id=eq.${encodeURIComponent(id)}&select=*`, { headers: headers() }))[0] ?? null;

/** Move a request from pending to approved or rejected in one step. Returns null if it was no longer pending. */
export const claimApproval = async (id: string, status: 'approved' | 'rejected', userId: string) =>
  (
    await rest<ApprovalRow[]>(`agent_approvals?id=eq.${encodeURIComponent(id)}&status=eq.pending`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ status, decided_by: userId, decided_at: new Date().toISOString() }),
    })
  )[0] ?? null;

export const finishApproval = async (id: string, status: 'executed' | 'failed', result: string) =>
  (
    await rest<ApprovalRow[]>(`agent_approvals?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ status, result }),
    })
  )[0];

export interface ScheduleRow {
  id: string;
  agent_id: string | null;
  builtin: 'ops' | null;
  name: string;
  input: string;
  frequency: 'hourly' | 'daily' | 'weekdays' | 'weekly';
  hour: number;
  minute: number;
  enabled: boolean;
  next_run_at: string | null;
}

/** Enabled schedules; the scheduler decides which are due. The table is small, so no clever filter is needed. */
export const dueSchedules = () => rest<ScheduleRow[]>('agent_schedules?enabled=eq.true&select=*&order=created_at.asc&limit=200', { headers: headers() });

/** Move next_run_at from what the scheduler saw to the new time, only if it still holds that value. False if someone else got there first. */
export async function claimSchedule(id: string, seen: string | null, next: string): Promise<boolean> {
  const condition = seen ? `next_run_at=eq.${encodeURIComponent(seen)}` : 'next_run_at=is.null';
  const rows = await rest<ScheduleRow[]>(`agent_schedules?id=eq.${encodeURIComponent(id)}&${condition}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ next_run_at: next }),
  });
  return Array.isArray(rows) && rows.length > 0;
}

export const markScheduleRan = (id: string, at: string, runId: string | null, error: string | null) =>
  rest<null>(`agent_schedules?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ last_run_at: at, last_run_id: runId, last_error: error }),
  });

export interface EvalCaseRow {
  id: string;
  agent_id: string;
  name: string;
  input: string;
  expect: unknown;
}

export const listEvalCases = (agentId: string) =>
  rest<EvalCaseRow[]>(`agent_eval_cases?agent_id=eq.${encodeURIComponent(agentId)}&select=*&order=created_at.asc&limit=50`, { headers: headers() });

export interface EvalRunRow {
  id: string;
  agent_id: string;
  status: 'running' | 'completed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  cost_usd: number;
}

export const createEvalRun = async (row: { agent_id: string; total: number; requested_by: string | null }) =>
  (await rest<EvalRunRow[]>('agent_eval_runs', { method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(row) }))[0];

export const updateEvalRun = (id: string, patch: Record<string, unknown>) =>
  rest<null>(`agent_eval_runs?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(patch) });

/** Is a test run for this agent still going (started in the last 15 minutes)? */
export async function runningEval(agentId: string): Promise<boolean> {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const rows = await rest<{ id: string }[]>(`agent_eval_runs?agent_id=eq.${encodeURIComponent(agentId)}&status=eq.running&started_at=gte.${since}&select=id&limit=1`, { headers: headers() });
  return rows.length > 0;
}

export interface ConnectionRow {
  id: string;
  kind: 'http_tool' | 'mcp';
  name: string;
  tool_id: string;
  description: string;
  config: unknown;
  enabled: boolean;
}

export const listConnections = () => rest<ConnectionRow[]>('agent_connections?select=*&order=created_at.asc&limit=200', { headers: headers() });

export interface FunnelJob {
  id: string;
  status: string;
  site_slug: string | null;
  custom_domain: string | null;
  domain_status: string;
  outputs: Record<string, unknown>;
  log: { at: string; step: string; ok: boolean; detail?: string }[];
  updated_at: string;
}

export const funnelJobs = (slug?: string) =>
  rest<FunnelJob[]>(
    `build_jobs?select=id,status,site_slug,custom_domain,domain_status,outputs,log,updated_at&order=updated_at.desc&limit=${slug ? 1 : 15}${slug ? `&site_slug=eq.${encodeURIComponent(slug)}` : ''}`,
    { headers: headers() },
  );

/**
 * Why a sign-in was refused, in words a person can act on. Called only after a refusal, so the three causes that look
 * the same from outside ("expired", "not on the team", "could not check") can be told apart.
 */
export async function whyDenied(jwt: string): Promise<string> {
  if (!jwt) return 'Sign in with a Breadmaker team account.';
  if (!config.supabaseUrl || !config.supabaseAnonKey) return 'The agent platform is not connected to the sign-in service yet.';
  try {
    const user = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(10_000) });
    if (!user.ok) {
      // What the sign-in service itself said (it never echoes the token), so the real cause can be seen.
      const said = await user.json().then((body: { msg?: string; message?: string; error_description?: string; error?: string }) => body.msg ?? body.message ?? body.error_description ?? body.error ?? '').catch(() => '');
      console.error(`sign-in check refused: ${user.status} ${said}`);
      return `Your sign-in could not be confirmed (the sign-in service answered ${user.status}${said ? `: ${String(said).slice(0, 120)}` : ''}). Reload the page and try again; if it keeps happening, send this message.`;
    }
    return 'You are signed in, but this account is not on the Breadmaker team.';
  } catch {
    return 'The platform could not reach the sign-in service. Try again in a moment.';
  }
}

/** Can this signed-in person change things (an owner or coach)? Decided by the database, with their own token. */
export async function canEdit(jwt: string): Promise<boolean> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return false;
  const check = await fetch(`${config.supabaseUrl}/rest/v1/rpc/can_edit_content`, {
    method: 'POST',
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'Content-Profile': 'breadmaker' },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  return check.ok && (await check.json()) === true;
}

/**
 * Is this signed-in person allowed to build agents of their own (a Prestige Partner)? Decided by the database with their
 * own token, so the rule lives in one place (breadmaker.can_build_agents). Returns their id, or null.
 */
export async function memberFor(jwt: string): Promise<string | null> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  const user = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(10_000) });
  if (!user.ok) return null;
  const { id } = (await user.json()) as { id?: string };
  if (!id) return null;
  const check = await fetch(`${config.supabaseUrl}/rest/v1/rpc/can_build_agents`, {
    method: 'POST',
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'Content-Profile': 'breadmaker' },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  return check.ok && (await check.json()) === true ? id : null;
}

/** Who is asking? The signed-in person's own token decides: they must be on the Breadmaker team. */
export async function teamMemberFor(jwt: string): Promise<string | null> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  const user = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(10_000) });
  if (!user.ok) return null;
  const { id } = (await user.json()) as { id?: string };
  if (!id) return null;
  const check = await fetch(`${config.supabaseUrl}/rest/v1/rpc/is_team_member`, {
    method: 'POST',
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'Content-Profile': 'breadmaker' },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  return check.ok && (await check.json()) === true ? id : null;
}
