import { supabase } from './supabase';

/**
 * Schedules: an agent that runs by itself on a timetable. Rows live in breadmaker.agent_schedules (the team reads,
 * owners and coaches write); the agent platform starts what is due, once a minute. Times are UTC. next_run_at is left
 * empty whenever a schedule is created or changed, and the platform fills it in within a minute.
 */

export type Frequency = 'hourly' | 'daily' | 'weekdays' | 'weekly';

export interface Schedule {
  id: string;
  agentId: string | null;
  builtin: 'ops' | null;
  name: string;
  input: string;
  frequency: Frequency;
  hour: number;
  minute: number;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastError: string | null;
}

export interface ScheduleDraft {
  name: string;
  input: string;
  frequency: Frequency;
  hour: number;
  minute: number;
}

const fromRow = (row: Record<string, any>): Schedule => ({
  id: row.id,
  agentId: row.agent_id ?? null,
  builtin: row.builtin ?? null,
  name: row.name,
  input: row.input,
  frequency: row.frequency,
  hour: row.hour,
  minute: row.minute,
  enabled: row.enabled,
  nextRunAt: row.next_run_at ?? null,
  lastRunAt: row.last_run_at ?? null,
  lastRunId: row.last_run_id ?? null,
  lastError: row.last_error ?? null,
});

const fail = (error: { message: string; code?: string }): never => {
  throw new Error(error.code === '42501' ? 'Only owners and coaches can change schedules.' : error.code === '23514' ? 'Check the name, the question and the time.' : error.message);
};

/** Schedules for one stored agent, or for the built-in Ops agent when agentId is 'ops'. */
export async function listSchedules(agentId: string | 'ops'): Promise<Schedule[]> {
  const query = supabase.from('agent_schedules').select('*').order('created_at', { ascending: true });
  const { data, error } = await (agentId === 'ops' ? query.eq('builtin', 'ops') : query.eq('agent_id', agentId));
  if (error) fail(error);
  return (data ?? []).map(fromRow);
}

export async function addSchedule(agentId: string | 'ops', draft: ScheduleDraft): Promise<Schedule> {
  const { data: auth } = await supabase.auth.getUser();
  const target = agentId === 'ops' ? { builtin: 'ops', agent_id: null } : { builtin: null, agent_id: agentId };
  const { data, error } = await supabase
    .from('agent_schedules')
    .insert({ ...target, name: draft.name.trim(), input: draft.input.trim(), frequency: draft.frequency, hour: draft.hour, minute: draft.minute, created_by: auth.user?.id ?? null })
    .select('*')
    .single();
  if (error) fail(error);
  return fromRow(data);
}

export async function setScheduleEnabled(id: string, enabled: boolean): Promise<void> {
  // Turning it back on clears next_run_at so the platform works out the next time from now, not from last week.
  const { error } = await supabase.from('agent_schedules').update(enabled ? { enabled, next_run_at: null } : { enabled }).eq('id', id);
  if (error) fail(error);
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('agent_schedules').delete().eq('id', id);
  if (error) fail(error);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "Every day at 07:00 UTC (08:00 in Lagos)". Lagos is UTC+1 all year. */
export function describeSchedule(schedule: Pick<Schedule, 'frequency' | 'hour' | 'minute'>): string {
  const utc = `${pad(schedule.hour)}:${pad(schedule.minute)} UTC`;
  const lagos = `${pad((schedule.hour + 1) % 24)}:${pad(schedule.minute)} in Lagos`;
  switch (schedule.frequency) {
    case 'hourly':
      return `Every hour, at ${pad(schedule.minute)} minutes past`;
    case 'daily':
      return `Every day at ${utc} (${lagos})`;
    case 'weekdays':
      return `Monday to Friday at ${utc} (${lagos})`;
    case 'weekly':
      return `Every Monday at ${utc} (${lagos})`;
  }
}
