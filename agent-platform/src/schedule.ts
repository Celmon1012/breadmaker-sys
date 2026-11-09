// The scheduler: once a minute, start whatever is due, exactly once. A schedule is a row in agent_schedules. A due row
// is claimed first (its next_run_at is moved in one conditional update), so a restart or a second instance cannot run
// it twice. Missed runs are not made up. All times are UTC.
import { fromSnapshot, registry, validateDef } from './defs.ts';
import { Refused, defRunnable, opsRunnable, startRun, type Runnable } from './runner.ts';
import { claimSchedule, dueSchedules, getAgentDef, getLatestVersion, markScheduleRan, type ScheduleRow } from './store.ts';

export type Frequency = ScheduleRow['frequency'];

/** The next time after `from` that a schedule is due. Weekly means Mondays; weekdays means Monday to Friday. */
export function nextRun(spec: { frequency: Frequency; hour: number; minute: number }, from: Date): Date {
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  if (spec.frequency === 'hourly') {
    next.setUTCMinutes(spec.minute);
    if (next <= from) next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }
  next.setUTCHours(spec.hour, spec.minute);
  const allowed = (d: Date) => {
    const day = d.getUTCDay(); // 0 Sunday .. 6 Saturday
    if (spec.frequency === 'weekdays') return day >= 1 && day <= 5;
    if (spec.frequency === 'weekly') return day === 1;
    return true;
  };
  while (next <= from || !allowed(next)) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

async function targetFor(schedule: ScheduleRow): Promise<Runnable> {
  if (schedule.builtin === 'ops') return opsRunnable();
  const stored = schedule.agent_id ? await getAgentDef(schedule.agent_id) : null;
  if (!stored) throw new Refused('The agent for this schedule no longer exists.');
  if (stored.status !== 'live') throw new Refused(`The agent is ${stored.status}, not live.`);
  // On a schedule an agent runs its last published version, never an unpublished draft.
  const published = await getLatestVersion(stored.id);
  if (!published) throw new Refused('The agent has no published version.');
  return defRunnable({ ...validateDef(fromSnapshot(published.snapshot), await registry()), id: stored.id, status: stored.status });
}

/** One pass over the schedules. Returns how many runs it started (for tests and logs). */
export async function tick(now = new Date()): Promise<number> {
  let started = 0;
  for (const schedule of await dueSchedules()) {
    const due = schedule.next_run_at ? new Date(schedule.next_run_at) : null;
    if (due && due > now) continue;
    // Claim: move next_run_at forward only if nobody else already did. If this loses the race, someone else runs it.
    const next = nextRun(schedule, now);
    if (!(await claimSchedule(schedule.id, schedule.next_run_at, next.toISOString()))) continue;
    if (!due) continue; // a new or edited schedule: it only needed its first next_run_at
    try {
      const runId = await startRun({ target: await targetFor(schedule), text: schedule.input, trigger: 'schedule', requestedBy: null });
      await markScheduleRan(schedule.id, now.toISOString(), runId, null);
      started += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await markScheduleRan(schedule.id, now.toISOString(), null, reason.slice(0, 300));
    }
  }
  return started;
}
