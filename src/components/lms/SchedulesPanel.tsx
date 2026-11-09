import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { errorMessage } from '../../lib/lms';
import { timeAgo } from '../../lib/agent-runs';
import { Frequency, Schedule, ScheduleDraft, addSchedule, deleteSchedule, describeSchedule, listSchedules, setScheduleEnabled } from '../../lib/agent-schedules';
import { Button, CARD, Chip, Field, Notice, Select, TextArea, TextInput, useTeamRole } from './lms-ui';

/**
 * "Run automatically": questions an agent is asked on a timetable. Each run is an ordinary run in the list, any change
 * it wants goes to approval, and a stored agent runs its last published version. Times are UTC, with Lagos shown.
 */
const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Monday to Friday' },
  { id: 'weekly', label: 'Every Monday' },
  { id: 'hourly', label: 'Every hour' },
];

const emptyDraft = (suggestion: string): ScheduleDraft => ({ name: '', input: suggestion, frequency: 'daily', hour: 7, minute: 0 });

export default function SchedulesPanel({ agentId, suggestion, openRun }: { agentId: string | 'ops'; suggestion: string; openRun?: (runId: string) => void }) {
  const { role } = useTeamRole();
  const canEdit = role === 'Owner' || role === 'Coach';
  const [items, setItems] = useState<Schedule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft(suggestion));
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setItems(await listSchedules(agentId));
    } catch {
      // The schedules table may not exist yet (migration 62): show an empty list rather than an error.
      setItems([]);
    }
  }, [agentId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (draft.name.trim().length < 2) throw new Error('Give the schedule a name.');
      if (draft.input.trim().length < 3) throw new Error('Write the question it should ask.');
      await addSchedule(agentId, draft);
      setAdding(false);
      setDraft(emptyDraft(suggestion));
    });

  return (
    <section aria-labelledby={`schedules-${agentId}`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 id={`schedules-${agentId}`} className="text-[18px] font-semibold">Run automatically</h2>
        {canEdit && !adding && <Button variant="ghost" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Add a schedule</Button>}
      </div>
      <p className="mb-3 text-[14px] text-[var(--pg-body)]">Ask it the same question on a timetable. Each run shows in the list, and anything it wants to change waits for approval.{agentId !== 'ops' && ' It runs the last published version.'}</p>
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}

      {adding && (
        <div className={`${CARD} mb-3 space-y-4 p-4 sm:p-5`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><TextInput value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Morning check" /></Field>
            <Field label="How often">
              <Select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as Frequency })}>
                {FREQUENCIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Question it is asked" hint="Written as you would ask it in the chat.">
            <TextArea rows={3} maxLength={2000} value={draft.input} onChange={(event) => setDraft({ ...draft, input: event.target.value })} />
          </Field>
          {draft.frequency === 'hourly' ? (
            <Field label="Minutes past the hour"><TextInput type="number" min={0} max={59} value={draft.minute} onChange={(event) => setDraft({ ...draft, minute: Math.min(59, Math.max(0, Number(event.target.value) || 0)) })} /></Field>
          ) : (
            <Field label="Time (UTC)" hint={`${describeSchedule(draft)}`}>
              <div className="flex items-center gap-2">
                <Select value={draft.hour} onChange={(event) => setDraft({ ...draft, hour: Number(event.target.value) })} aria-label="Hour">
                  {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}</option>)}
                </Select>
                <span>:</span>
                <Select value={draft.minute} onChange={(event) => setDraft({ ...draft, minute: Number(event.target.value) })} aria-label="Minute">
                  {[0, 15, 30, 45].map((minute) => <option key={minute} value={minute}>{String(minute).padStart(2, '0')}</option>)}
                </Select>
              </div>
            </Field>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void save()} busy={busy}>Save schedule</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {items === null ? null : items.length === 0 ? (
        !adding && <div className={`${CARD} p-4 text-[14.5px] text-[var(--pg-body)]`}>Nothing is scheduled.{canEdit ? ' Add one and it runs without anyone asking.' : ''}</div>
      ) : (
        <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="text-[14.5px] font-semibold">{item.name}</span>{!item.enabled && <Chip>Paused</Chip>}</div>
                <div className="text-[13px] text-[var(--pg-body)]">{describeSchedule(item)}</div>
                <p className="mt-1 line-clamp-2 text-[13.5px] text-[var(--pg-body)]">“{item.input}”</p>
                <div className="mt-1 text-[12.5px] text-[var(--pg-body)]">
                  {item.lastRunAt ? <>Last ran {timeAgo(item.lastRunAt)}{item.lastRunId && openRun ? <> · <button type="button" className="cursor-pointer underline" onClick={() => openRun(item.lastRunId!)}>see the run</button></> : null}</> : 'Has not run yet'}
                  {item.enabled && item.nextRunAt ? ` · next ${new Date(item.nextRunAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
                {item.lastError && <p className="mt-1 text-[12.5px] text-[#B42318]">Last attempt did not run: {item.lastError}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <Button variant="ghost" busy={busy} onClick={() => void run(() => setScheduleEnabled(item.id, !item.enabled))}>{item.enabled ? 'Pause' : 'Resume'}</Button>
                  <Button variant="danger" busy={busy} onClick={() => { if (window.confirm(`Delete the schedule "${item.name}"?`)) void run(() => deleteSchedule(item.id)); }} aria-label={`Delete ${item.name}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
