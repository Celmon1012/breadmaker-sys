import { supabase } from './supabase';
import { AGENT_PLATFORM_URL, freshToken } from './agent-runs';

/**
 * Evals: test questions for an agent, and the results of running them. Cases live in breadmaker.agent_eval_cases (the
 * team reads, owners and coaches write); a run is started through the agent platform, which runs every case against the
 * agent's working copy in the background and records each result in breadmaker.agent_eval_runs.
 */

export interface Expect {
  contains: string[];
  notContains: string[];
  tools: string[];
  noTools: string[];
  judge: string;
}

export interface EvalCase {
  id: string;
  agentId: string;
  name: string;
  input: string;
  expect: Expect;
}

export interface CaseResult {
  caseId: string;
  name: string;
  passed: boolean;
  reasons: string[];
  output: string;
  tools: string[];
  costUsd: number;
}

export interface EvalRun {
  id: string;
  status: 'running' | 'completed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  costUsd: number;
  results: CaseResult[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export const emptyExpect = (): Expect => ({ contains: [], notContains: [], tools: [], noTools: [], judge: '' });

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

const caseFromRow = (row: Record<string, any>): EvalCase => ({
  id: row.id,
  agentId: row.agent_id,
  name: row.name,
  input: row.input,
  expect: { contains: asList(row.expect?.contains), notContains: asList(row.expect?.notContains), tools: asList(row.expect?.tools), noTools: asList(row.expect?.noTools), judge: String(row.expect?.judge ?? '') },
});

const runFromRow = (row: Record<string, any>): EvalRun => ({
  id: row.id,
  status: row.status,
  total: row.total ?? 0,
  passed: row.passed ?? 0,
  failed: row.failed ?? 0,
  costUsd: Number(row.cost_usd) || 0,
  results: Array.isArray(row.results) ? row.results : [],
  error: row.error ?? null,
  startedAt: row.started_at,
  finishedAt: row.finished_at ?? null,
});

const fail = (error: { message: string; code?: string }): never => {
  throw new Error(error.code === '42501' ? 'Only owners and coaches can change tests.' : error.code === '23514' ? 'Give the test a name and a question.' : error.message);
};

export async function listCases(agentId: string): Promise<EvalCase[]> {
  const { data, error } = await supabase.from('agent_eval_cases').select('*').eq('agent_id', agentId).order('created_at', { ascending: true });
  if (error) fail(error);
  return (data ?? []).map(caseFromRow);
}

export async function addCase(agentId: string, draft: { name: string; input: string; expect: Expect }): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('agent_eval_cases').insert({ agent_id: agentId, name: draft.name.trim(), input: draft.input.trim(), expect: draft.expect, created_by: auth.user?.id ?? null });
  if (error) fail(error);
}

export async function deleteCase(id: string): Promise<void> {
  const { error } = await supabase.from('agent_eval_cases').delete().eq('id', id);
  if (error) fail(error);
}

/** The most recent test runs for an agent, newest first. */
export async function latestRuns(agentId: string, limit = 5): Promise<EvalRun[]> {
  const { data, error } = await supabase.from('agent_eval_runs').select('*').eq('agent_id', agentId).order('started_at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return (data ?? []).map(runFromRow);
}

/** Start a test run through the platform. It answers at once; the results arrive as the cases finish. */
export async function startTests(agentId: string): Promise<void> {
  const token = await freshToken();
  if (!token) throw new Error('Sign in again to run tests.');
  const response = await fetch(`${AGENT_PLATFORM_URL}/evals/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ agentId }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error || `The agent platform answered ${response.status}.`);
}

/** "3 of 4 passed", for places that show the state of the tests in one line. */
export function summary(run: EvalRun | undefined): { label: string; ok: boolean | null } {
  if (!run) return { label: 'No tests have been run yet', ok: null };
  if (run.status === 'running') return { label: `Running: ${run.passed + run.failed} of ${run.total} done`, ok: null };
  if (run.status === 'failed') return { label: `The test run failed: ${run.error ?? 'unknown error'}`, ok: false };
  return { label: `${run.passed} of ${run.total} passed`, ok: run.failed === 0 && run.total > 0 };
}

/** Split "a, b, c" into a clean list. */
export const splitList = (text: string): string[] => text.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);
