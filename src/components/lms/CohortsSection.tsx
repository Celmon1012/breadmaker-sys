import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { PROGRAM_NAME, ProgramKey, formatProgramDate } from '../../lib/program-config';
import { CohortDraft, CohortRow, WaitlistRow, deleteCohort, loadCohorts, loadWaitlist, saveCohort } from '../../lib/programs';
import { errorMessage } from '../../lib/lms';
import { Button, CARD, Chip, EmptyState, Field, Loading, Notice, Select, TextArea, TextInput } from './lms-ui';

/**
 * Cohorts are the runs the program pages advertise: a start date, a size and a
 * status. Capacity and places left on the marketing pages come from here, and
 * anyone who cannot get a place lands on the waitlist below.
 */

const emptyDraft = (): CohortDraft => ({
  program: 'foundry',
  label: '',
  startsOn: '',
  endsOn: '',
  capacity: '',
  status: 'open',
  timezone: 'Africa/Lagos',
  notes: '',
});

const fromRow = (row: CohortRow): CohortDraft => ({
  id: row.id,
  program: row.program,
  label: row.label,
  startsOn: row.startsOn ?? '',
  endsOn: row.endsOn ?? '',
  capacity: row.capacity === null ? '' : String(row.capacity),
  status: row.status,
  timezone: row.timezone,
  notes: row.notes,
});

const STATUS_LABEL: Record<string, string> = { open: 'Open', running: 'Running', closed: 'Closed' };

export default function CohortsSection({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<CohortRow[] | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistRow[] | null>(null);
  const [draft, setDraft] = useState<CohortDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [cohorts, waiting] = await Promise.all([loadCohorts(), loadWaitlist()]);
      setRows(cohorts);
      setWaitlist(waiting);
    } catch (err) {
      setRows([]);
      setWaitlist([]);
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveCohort(draft);
      setMessage({ tone: 'success', text: draft.id ? 'Cohort updated.' : 'Cohort added.' });
      setDraft(null);
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: CohortRow) => {
    if (!window.confirm(`Delete ${row.label || 'this cohort'}? Applications stay, but lose their run.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteCohort(row.id);
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const set = (field: keyof CohortDraft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDraft((current) => (current ? { ...current, [field]: event.target.value } : current));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Cohorts</h1>
          <p className="mt-2 max-w-[640px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
            The dates and places the program pages advertise. A run with a date and a capacity shows both on the site, and closes
            itself when the places are taken.
          </p>
        </div>
        {canEdit && !draft && (
          <Button onClick={() => setDraft(emptyDraft())}>
            <CalendarPlus className="h-4 w-4" /> New cohort
          </Button>
        )}
      </div>

      {message && <div className="mb-6"><Notice tone={message.tone}>{message.text}</Notice></div>}

      {draft && canEdit && (
        <form onSubmit={save} className={`${CARD} mb-6 grid gap-4 p-6 md:grid-cols-3`}>
          <Field label="Program">
            <Select value={draft.program} onChange={set('program')}>
              <option value="foundry">Foundry</option>
              <option value="launchpad">Launchpad</option>
            </Select>
          </Field>
          <Field label="Label" hint="What the site calls this run.">
            <TextInput value={draft.label} onChange={set('label')} placeholder="November cohort" />
          </Field>
          <Field label="Status">
            <Select value={draft.status} onChange={set('status')}>
              <option value="open">Open — accepting applications</option>
              <option value="running">Running — in progress</option>
              <option value="closed">Closed — finished</option>
            </Select>
          </Field>
          <Field label="Starts">
            <TextInput type="date" value={draft.startsOn} onChange={set('startsOn')} />
          </Field>
          <Field label="Ends">
            <TextInput type="date" value={draft.endsOn} onChange={set('endsOn')} />
          </Field>
          <Field label="Places" hint="Leave empty for no limit.">
            <TextInput type="number" min={1} value={draft.capacity} onChange={set('capacity')} placeholder="6" />
          </Field>
          <Field label="Timezone" className="md:col-span-1">
            <TextInput value={draft.timezone} onChange={set('timezone')} placeholder="Africa/Lagos" />
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <TextArea rows={2} value={draft.notes} onChange={set('notes')} placeholder="Who is coaching, what is different this run." />
          </Field>
          <div className="flex gap-3 md:col-span-3">
            <Button type="submit" busy={busy}>{draft.id ? 'Save cohort' : 'Add cohort'}</Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </form>
      )}

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No cohorts yet"
          body="Add a run with a start date and a size, and the program pages will advertise it."
          action={canEdit ? <Button onClick={() => setDraft(emptyDraft())}>Add the first cohort</Button> : undefined}
        />
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-[860px] text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-[var(--pg-line)] font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]">
                <th className="px-6 py-4 font-medium">Run</th>
                <th className="px-4 py-4 font-medium">Starts</th>
                <th className="px-4 py-4 font-medium">Places</th>
                <th className="px-4 py-4 font-medium">Taken</th>
                <th className="px-4 py-4 font-medium">Waitlist</th>
                <th className="px-4 py-4 font-medium">Status</th>
                {canEdit && <th className="px-4 py-4" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--pg-line-soft)]">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-6 py-4">
                    <span className="block font-medium">{row.label || 'Untitled run'}</span>
                    <span className="text-[13px] text-[var(--pg-body)]">{PROGRAM_NAME[row.program as ProgramKey] ?? row.program}</span>
                  </td>
                  <td className="px-4 py-4 text-[var(--pg-body)]">
                    {formatProgramDate(row.startsOn) ?? 'Not set'}
                    {row.endsOn ? ` → ${formatProgramDate(row.endsOn)}` : ''}
                  </td>
                  <td className="px-4 py-4">{row.capacity ?? 'No limit'}</td>
                  <td className="px-4 py-4">{row.taken}</td>
                  <td className="px-4 py-4">{row.waitlist}</td>
                  <td className="px-4 py-4">
                    <Chip tone={row.status === 'open' ? 'accent' : 'neutral'}>{STATUS_LABEL[row.status] ?? row.status}</Chip>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setDraft(fromRow(row))}
                          className="rounded-full p-2 text-[var(--pg-body)] hover:bg-[var(--pg-alt)] cursor-pointer"
                          aria-label={`Edit ${row.label || 'cohort'}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void remove(row)}
                          className="rounded-full p-2 text-[var(--pg-body)] hover:bg-[var(--pg-alt)] hover:text-[#B42318] cursor-pointer"
                          aria-label={`Delete ${row.label || 'cohort'}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10">
        <h2 className="font-editorial text-[24px] font-semibold">Waitlist</h2>
        <p className="mt-1 max-w-[620px] text-[14.5px] text-[var(--pg-body)]">
          People who asked to be told when a place opens. Nothing is sent automatically.
        </p>
        {!waitlist ? (
          <Loading />
        ) : waitlist.length === 0 ? (
          <p className="mt-4 text-[14.5px] text-[var(--pg-body)]">Nobody is waiting.</p>
        ) : (
          <ul className={`${CARD} mt-4 divide-y divide-[var(--pg-line-soft)]`}>
            {waitlist.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 text-[14.5px]">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{row.name}</span>
                  <span className="block text-[13px] text-[var(--pg-body)]">{row.email}{row.phone ? ` · ${row.phone}` : ''}</span>
                </span>
                <span className="text-[13px] text-[var(--pg-body)]">
                  {PROGRAM_NAME[row.program as ProgramKey] ?? row.program}
                  {row.cohortLabel ? ` · ${row.cohortLabel}` : ''}
                </span>
                <span className="text-[13px] text-[var(--pg-body)]">{new Date(row.createdAt).toLocaleDateString()}</span>
                <a
                  href={`mailto:${row.email}?subject=${encodeURIComponent('A place has opened at Breadmaker')}`}
                  className="rounded-full border border-[var(--pg-line)] px-4 py-2 text-[13.5px] transition hover:bg-[var(--pg-alt)]"
                >
                  Email
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
