/**
 * Which agent works on which leak. The Leak Test names the weakest pillar; this says what agent goes after it, and
 * is honest about whether that agent is already running for Restart. Breadmaker only offers what Restart runs, so
 * `proof` is the whole point: nothing here may say "runs" unless it does.
 *
 *   restart  : Restart runs this on its own business today (outside the agent platform, so no run records yet).
 *   platform : runs on the agent platform, with run records in the studio.
 *   built    : built at Restart, but with no results to show yet. The page upgrades it to `restart` once live numbers exist.
 *   design   : designed but not running anywhere yet.
 */
export type AgentProof = 'restart' | 'platform' | 'built' | 'design';

export interface LeakAgent {
  name: string;
  job: string;
  proof: AgentProof;
  /** What is true today, in plain words. */
  evidence: string;
}

const BY_PILLAR: Record<string, LeakAgent> = {
  sales: {
    name: 'Follow-up agent',
    job: 'Reads each new enquiry, drafts the reply and the next follow-up, and flags the ones ready to buy.',
    proof: 'restart',
    evidence: 'Restart runs a follow-up agent on its own enquiries every day. It drafts; a person approves each message before it sends.',
  },
  finance: {
    name: 'Payment reminders',
    job: 'Chases overdue invoices on a schedule, so cash does not wait on you remembering.',
    proof: 'restart',
    evidence: 'Restart sends its own overdue-invoice reminders automatically, on a schedule, until the invoice is paid. It is automation, not yet an agent that writes its own messages.',
  },
  operations: {
    name: 'Support triage agent',
    job: 'Reads incoming support messages and drafts the reply, so nothing sits unanswered.',
    proof: 'built',
    evidence: 'Built at Restart to draft support replies; nothing is sent until a person approves the draft. It only answers conversations opened from the client console.',
  },
  tech: {
    name: 'Ops agent',
    job: 'Checks that your apps, sites and domains are up, and tells you in plain words what is wrong.',
    proof: 'platform',
    evidence: 'Runs on the Breadmaker agent platform today with every run recorded. It looks on its own; a restart or redeploy it asks for waits for a person to approve.',
  },
  team: {
    name: 'Handover assistant',
    job: 'Turns what only you know into written steps the team can follow.',
    proof: 'design',
    evidence: 'Designed, not running yet. We will offer it once it runs for Restart first.',
  },
};

/** The agent for a pillar, or null when the fix for that leak is not an agent (offer and positioning is a page, not a worker). */
export const agentForPillar = (pillarId: string): LeakAgent | null => BY_PILLAR[pillarId] ?? null;

export const PROOF_LABEL: Record<AgentProof, string> = {
  restart: 'Runs at Restart',
  platform: 'Running on our platform',
  built: 'Built at Restart, no results yet',
  design: 'In design',
};

/** Totals for Restart's own follow-up agent over the last `days` days (from restart_agent_stats; no client details). */
export interface RestartAgentStats {
  days: number;
  runs: number;
  failed: number;
  lastRunAt: string | null;
  inquiriesReviewed: number;
  deliverablesReviewed: number;
  actions: number;
  drafts: { proposed: number; approved: number; rejected: number; waiting: number };
}

/** Null when the numbers are not available (the function is not applied yet, or Restart's tables are not here). */
export async function restartAgentStats(): Promise<RestartAgentStats | null> {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.rpc('restart_agent_stats');
  if (error || !data) return null;
  return data as RestartAgentStats;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/**
 * One honest sentence from the numbers, or null when the agent has not run in the window (then the static evidence
 * stands). It does not count "items looked at": each run rescans the same open enquiries, so summing them overstates.
 */
export function statsSentence(stats: RestartAgentStats | null): string | null {
  if (!stats || stats.runs === 0) return null;
  const { proposed, approved, rejected, waiting } = stats.drafts;
  let text = `In the last ${stats.days} days it ran ${plural(stats.runs, 'time')}${stats.failed ? ` (${stats.failed} failed)` : ' with no failures'}`;
  if (stats.actions) text += `, took ${plural(stats.actions, 'action')} (notes, reminders and drafts)`;
  text += proposed ? ` and drafted ${plural(proposed, 'follow-up message')}.` : '.';
  if (proposed) {
    text += ` People have approved ${approved}${rejected ? ` and rejected ${rejected}` : ''} so far${waiting ? `; ${waiting} ${waiting === 1 ? 'is' : 'are'} waiting for a person` : ''}.`;
  }
  return text;
}

/** Totals for Restart's support agent: replies it drafted and what people did with them (from restart_support_stats). */
export interface RestartSupportStats {
  days: number;
  drafted: number;
  approved: number;
  rejected: number;
  waiting: number;
}

export async function restartSupportStats(): Promise<RestartSupportStats | null> {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.rpc('restart_support_stats');
  if (error || !data) return null;
  return data as RestartSupportStats;
}

/** Null when it drafted nothing in the window. Nothing is sent until a person approves, so that is said once, plainly. */
export function supportSentence(stats: RestartSupportStats | null): string | null {
  if (!stats || stats.drafted === 0) return null;
  const { drafted, approved, rejected, waiting } = stats;
  return `In the last ${stats.days} days it drafted ${plural(drafted, 'reply', 'replies')}. People have approved ${approved}${rejected ? ` and rejected ${rejected}` : ''} so far${waiting ? `; ${waiting} ${waiting === 1 ? 'is' : 'are'} waiting for a person` : ''}.`;
}

/** The live line for a leak's agent, when Restart runs that agent and there are numbers; null otherwise (the plain statement stands). */
export async function liveAgentLine(pillarId: string): Promise<string | null> {
  if (pillarId === 'sales') return statsSentence(await restartAgentStats());
  if (pillarId === 'operations') return supportSentence(await restartSupportStats());
  return null;
}
