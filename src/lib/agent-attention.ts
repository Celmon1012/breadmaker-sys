import { supabase } from './supabase';
import { AgentRun } from './agent-runs';
import { Approval } from './agent-approvals';
import { StoredAgent } from './agent-defs';

/**
 * What needs a person's attention across all agents, gathered into one list for the control room: requests waiting for
 * approval, agents whose runs are failing, tests that fail, schedules that did not run, knowledge that could not be read,
 * and tools the platform is not offering. Each item says what is wrong and where to go to fix it. Anything that cannot
 * be loaded (a table not set up yet) is simply left out, so the list never fails as a whole.
 */
export interface AttentionItem {
  id: string;
  kind: 'approval' | 'runs' | 'tests' | 'schedule' | 'knowledge' | 'platform';
  label: string;
  title: string;
  detail: string;
  action: { label: string; path: string };
}

const DAY = 86_400_000;
const isReal = (run: AgentRun) => !run.agent.startsWith('preview:') && !run.agent.startsWith('eval:');

export async function loadAttention(input: { agents: StoredAgent[]; runs: AgentRun[]; approvals: Approval[]; problems: { id: string; reason: string }[] }): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const nameOf = (id: string | null) => (id ? input.agents.find((a) => a.id === id)?.name : undefined);
  const pathOf = (id: string | null) => (id && input.agents.some((a) => a.id === id) ? `/studio/agents/${id}` : '/studio/agents');

  const pending = input.approvals.filter((a) => a.status === 'pending');
  if (pending.length) {
    items.push({ id: 'approvals', kind: 'approval', label: 'Approval', title: `${pending.length} request${pending.length === 1 ? ' is' : 's are'} waiting for a person`, detail: pending[0].summary, action: { label: 'Review', path: '/studio/agents' } });
  }

  // Agents whose real runs failed in the last week.
  const since = Date.now() - 7 * DAY;
  const byAgent = new Map<string, { name: string; failed: number; total: number; id: string | null }>();
  for (const run of input.runs.filter((r) => isReal(r) && new Date(r.startedAt).getTime() >= since)) {
    const key = run.agentId ?? run.agent;
    const row = byAgent.get(key) ?? { name: run.agentId ? nameOf(run.agentId) ?? run.agent : run.agent === 'ops' ? 'Ops' : run.agent, failed: 0, total: 0, id: run.agentId };
    row.total += 1;
    if (run.status === 'failed') row.failed += 1;
    byAgent.set(key, row);
  }
  for (const row of byAgent.values()) {
    if (row.failed > 0 && row.failed / row.total >= 0.25) {
      items.push({ id: `runs-${row.name}`, kind: 'runs', label: 'Reliability', title: `${row.name} failed ${row.failed} of ${row.total} runs this week`, detail: 'Open its runs to see what went wrong.', action: { label: 'Open', path: row.id ? pathOf(row.id) : '/studio/agents/ops' } });
    }
  }

  // Latest test run per agent.
  try {
    const { data } = await supabase.from('agent_eval_runs').select('agent_id, status, total, passed, failed, started_at').order('started_at', { ascending: false }).limit(60);
    const seen = new Set<string>();
    for (const row of data ?? []) {
      if (seen.has(row.agent_id)) continue;
      seen.add(row.agent_id);
      if (row.status === 'completed' && row.failed > 0) {
        items.push({ id: `tests-${row.agent_id}`, kind: 'tests', label: 'Tests', title: `${nameOf(row.agent_id) ?? 'An agent'}: ${row.passed} of ${row.total} tests pass`, detail: 'The last test run found answers that missed what was expected.', action: { label: 'See tests', path: pathOf(row.agent_id) } });
      }
    }
  } catch {
    /* the table may not exist yet */
  }

  // Schedules whose last attempt did not run.
  try {
    const { data } = await supabase.from('agent_schedules').select('id, agent_id, builtin, name, last_error').eq('enabled', true).not('last_error', 'is', null);
    for (const row of data ?? []) {
      items.push({ id: `schedule-${row.id}`, kind: 'schedule', label: 'Schedule', title: `“${row.name}” did not run`, detail: String(row.last_error), action: { label: 'Fix', path: row.builtin ? '/studio/agents/ops' : pathOf(row.agent_id) } });
    }
  } catch {
    /* ignore */
  }

  // Knowledge that could not be read.
  try {
    const { data } = await supabase.from('agent_knowledge_sources').select('id, agent_id, name, error').eq('status', 'failed');
    for (const row of data ?? []) {
      items.push({ id: `knowledge-${row.id}`, kind: 'knowledge', label: 'Knowledge', title: `${nameOf(row.agent_id) ?? 'An agent'} could not read “${row.name}”`, detail: String(row.error ?? 'The source failed.'), action: { label: 'Open', path: `${pathOf(row.agent_id)}/edit` } });
    }
  } catch {
    /* ignore */
  }

  for (const problem of input.problems) {
    items.push({ id: `platform-${problem.id}`, kind: 'platform', label: 'Connection', title: `${problem.id} is not offered to agents`, detail: problem.reason, action: { label: 'Fix', path: '/studio/connections' } });
  }
  return items;
}

/** Runs of one agent in the last 7 days, real ones only (not previews or tests). */
export function weekOf(runs: AgentRun[], match: (run: AgentRun) => boolean): AgentRun[] {
  const since = Date.now() - 7 * DAY;
  return runs.filter((run) => isReal(run) && match(run) && new Date(run.startedAt).getTime() >= since);
}

export const successRate = (runs: AgentRun[]): number | null => {
  const done = runs.filter((run) => run.status !== 'running');
  return done.length ? Math.round((done.filter((run) => run.status === 'completed').length / done.length) * 100) : null;
};
