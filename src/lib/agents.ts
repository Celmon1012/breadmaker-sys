import { supabase } from './supabase';

export type BlueprintId = 'qualifier' | 'nurturer' | 'educator' | 'manager';
export type AgentStatus = 'draft' | 'testing' | 'ready';

export interface Blueprint {
  id: BlueprintId;
  name: string;
  /** One line: what this agent does for the funnel. */
  job: string;
  /** Which scorecard segment it works, when the funnel has a scorecard. */
  segment: 'ready' | 'warming' | 'early' | null;
  steps: { id: string; title: string; body: string }[];
}

/**
 * The agents a member can build for a funnel. Each is a blueprint: a job, and the steps to set it up from the
 * funnel's own brief. The steps are the course lessons turned into doing, so a member learns by building.
 */
export const BLUEPRINTS: Blueprint[] = [
  {
    id: 'qualifier',
    name: 'Qualifier',
    job: 'Designed to reply first to people who are ready now, ask the few questions that matter, and book the call.',
    segment: 'ready',
    steps: [
      { id: 'voice', title: 'Set how it speaks for you', body: 'Read the funnel brief and write two sentences on your tone: how you greet a new customer and how you close.' },
      { id: 'questions', title: 'Choose its three questions', body: 'The fewest questions that tell you whether this person can buy: budget range, timing, and what they tried before.' },
      { id: 'booking', title: 'Give it the next step', body: 'Pick where a qualified lead goes: your booking link, a WhatsApp chat, or a payment link.' },
      { id: 'handover', title: 'Say when it hands over to you', body: 'List what it must never answer alone: prices outside your list, refunds, anything legal or medical.' },
      { id: 'test', title: 'Test it on three enquiries', body: 'Write one easy, one awkward and one off-topic enquiry, and check the reply you would be happy to send.' },
    ],
  },
  {
    id: 'nurturer',
    name: 'Nurturer',
    job: 'Designed to follow up with warm leads over a few days, so a maybe does not go quiet.',
    segment: 'warming',
    steps: [
      { id: 'objection', title: 'Name the one thing holding them back', body: 'For this funnel’s customer: the doubt that stops a warm lead buying. Everything it sends answers that.' },
      { id: 'sequence', title: 'Plan three follow-ups', body: 'Day 1, day 3 and day 6: one useful message each, never a pushy one.' },
      { id: 'stop', title: 'Set when it stops', body: 'It stops the moment they reply, book or say no. Write the line it uses to say goodbye kindly.' },
      { id: 'consent', title: 'Check consent', body: 'It only messages on WhatsApp when the person ticked the box. Confirm email is the fallback.' },
      { id: 'test', title: 'Test the sequence', body: 'Read all three messages as the customer would. Cut anything you would ignore.' },
    ],
  },
  {
    id: 'educator',
    name: 'Educator',
    job: 'Designed to help people who are early with something useful, so they come back when they are ready.',
    segment: 'early',
    steps: [
      { id: 'topic', title: 'Pick the one thing they need to learn first', body: 'The first step that moves an early lead closer to buying from you.' },
      { id: 'resource', title: 'Choose what it shares', body: 'A short guide, a checklist or a link to your best page. Only what you already have.' },
      { id: 'cadence', title: 'Set a gentle rhythm', body: 'One message a week for three weeks, then it goes quiet and tags them to revisit.' },
      { id: 'upgrade', title: 'Say when it moves them up', body: 'If they reply with buying signals, it passes them to the Qualifier.' },
      { id: 'test', title: 'Test it', body: 'Send yourself the first message and check it helps without asking for anything.' },
    ],
  },
  {
    id: 'manager',
    name: 'Funnel manager',
    job: 'Designed to read your enquiries and scores each week and propose changes to the funnel. You approve every change.',
    segment: null,
    steps: [
      { id: 'goal', title: 'Say what a good week looks like', body: 'One number to move: enquiries, ready leads, or booked calls.' },
      { id: 'review', title: 'Choose what it reviews', body: 'Enquiry volume, score spread, and which questions people drop out on.' },
      { id: 'limits', title: 'Set its limits', body: 'It only proposes. It cannot change the funnel, spend money or message customers.' },
      { id: 'approve', title: 'Decide how you approve', body: 'A proposal arrives as an update request you accept or decline, and each accepted one uses a revision.' },
      { id: 'test', title: 'Test a proposal', body: 'Read an example proposal and check you can tell what it changes and why.' },
    ],
  },
];

export const blueprintOf = (id: string) => BLUEPRINTS.find((blueprint) => blueprint.id === id);

export interface FunnelAgent {
  id: string;
  jobId: string;
  blueprint: BlueprintId;
  status: AgentStatus;
  stepsDone: string[];
  createdAt: string;
  updatedAt: string;
}

const fromRow = (row: Record<string, any>): FunnelAgent => ({
  id: row.id,
  jobId: row.job_id,
  blueprint: row.blueprint,
  status: row.status,
  stepsDone: row.steps_done ?? [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** The agents on the given funnels (the member's own: callers pass the ids from myFunnels). */
export async function myAgents(jobIds: string[]): Promise<FunnelAgent[]> {
  if (!jobIds.length) return [];
  const { data, error } = await supabase.from('funnel_agents').select('*').in('job_id', jobIds).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRow);
}

export async function addAgent(jobId: string, blueprint: BlueprintId): Promise<FunnelAgent> {
  const { data, error } = await supabase.from('funnel_agents').insert({ job_id: jobId, blueprint }).select('*').single();
  if (error) throw new Error(error.code === '23505' ? 'That funnel already has this agent.' : error.message);
  return fromRow(data);
}

/** Records which steps are done, and the status that follows from them. */
export async function saveSteps(agent: FunnelAgent, stepsDone: string[]): Promise<FunnelAgent> {
  const total = blueprintOf(agent.blueprint)?.steps.length ?? 0;
  const status: AgentStatus = stepsDone.length === 0 ? 'draft' : stepsDone.length >= total ? 'ready' : 'testing';
  const { data, error } = await supabase
    .from('funnel_agents')
    .update({ steps_done: stepsDone, status, updated_at: new Date().toISOString() })
    .eq('id', agent.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data);
}

export async function removeAgent(id: string): Promise<void> {
  const { error } = await supabase.from('funnel_agents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export const STATUS_LABEL: Record<AgentStatus, string> = { draft: 'Setting up', testing: 'Testing', ready: 'Ready' };

/** One enquiry as the Agents and Integrations pages see it. */
export interface LeadRow {
  jobId: string;
  createdAt: string;
  status: 'pending' | 'sent' | 'emailed' | 'failed';
  name: string;
  score: number | null;
  segment: 'ready' | 'warming' | 'early' | null;
}

export async function myLeads(jobIds: string[]): Promise<LeadRow[]> {
  if (!jobIds.length) return [];
  const { data, error } = await supabase
    .from('funnel_leads')
    .select('job_id, created_at, status, payload')
    .in('job_id', jobIds)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error || !data) return [];
  return data.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const segment = ['ready', 'warming', 'early'].includes(String(payload.segment)) ? (payload.segment as LeadRow['segment']) : null;
    return {
      jobId: row.job_id as string,
      createdAt: row.created_at as string,
      status: row.status as LeadRow['status'],
      name: typeof payload.name === 'string' ? payload.name : 'Someone',
      score: typeof payload.score === 'number' ? payload.score : null,
      segment,
    };
  });
}
