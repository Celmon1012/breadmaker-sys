import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BuildBriefPanel from './BuildBriefPanel';
import { Check, ChevronDown, Mail, Search } from 'lucide-react';
import {
  APPLICATION_STATUS_LABEL,
  ApplicationStatus,
  PROGRAM_NAME,
  ProgramKey,
  TIER_LABEL,
  formatProgramDate,
} from '../../lib/program-config';
import { questionLabel } from '../../lib/program-questions';
import { ApplicationRow, loadApplications, setApplicationStatus } from '../../lib/programs';
import { TeamCourseRow, enrollByEmail, errorMessage } from '../../lib/lms';
import { Button, CARD, Chip, EmptyState, Field, Loading, Notice, Select, TextArea, TextInput } from './lms-ui';

/**
 * The applications queue: every Foundry application and Launchpad booking, with
 * the answers, and the steps from new to enrolled.
 */

const STATUS_TONES: Record<string, 'neutral' | 'accent' | 'dark'> = {
  new: 'accent',
  reviewed: 'neutral',
  accepted: 'dark',
  invoiced: 'dark',
  paid: 'dark',
  enrolled: 'accent',
  declined: 'neutral',
};

/** The next actions offered for each status, in the order they are worked. */
const NEXT_ACTIONS: Record<string, ApplicationStatus[]> = {
  new: ['reviewed', 'accepted', 'declined'],
  reviewed: ['accepted', 'declined'],
  accepted: ['invoiced', 'declined'],
  invoiced: ['paid', 'declined'],
  paid: ['enrolled'],
  enrolled: [],
  declined: ['reviewed'],
};

interface ApplicationsSectionProps {
  /** show only this program's applications (the tab above already says which) */
  programFilter?: string;
  /** inside the Applications tabs: no page title */
  embedded?: boolean;
  courses: TeamCourseRow[] | null;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}

export default function ApplicationsSection({ courses, canEdit, onChanged, programFilter, embedded = false }: ApplicationsSectionProps) {
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [status, setStatus] = useState('all');
  const [program, setProgram] = useState(programFilter ?? 'all');
  useEffect(() => {
    if (programFilter) setProgram(programFilter);
  }, [programFilter]);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await loadApplications(status, program));
    } catch (err) {
      setRows([]);
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }, [status, program]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) =>
        !needle ||
        row.name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        (row.company ?? '').toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const move = async (row: ApplicationRow, next: ApplicationStatus, note?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await setApplicationStatus(row.id, next, note);
      setMessage({ tone: 'success', text: `${row.name} is now ${APPLICATION_STATUS_LABEL[next].toLowerCase()}.` });
      await refresh();
      await onChanged();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const enroll = async (row: ApplicationRow) => {
    const course = (courses ?? []).find((item) => item.program === row.program);
    if (!course) {
      setMessage({ tone: 'error', text: `No course is set up for ${row.program}. Create it under Courses first.` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await enrollByEmail(row.email, course.id, `${PROGRAM_NAME[row.program as ProgramKey] ?? row.program} · ${row.tier || 'no tier'}`);
      await setApplicationStatus(row.id, 'enrolled');
      setMessage({ tone: 'success', text: `${row.email} is enrolled in ${course.title}.` });
      await refresh();
      await onChanged();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [rows]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          {!embedded && <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Applications</h1>}
          <p className="mt-2 max-w-[640px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
            Every Foundry application, Launchpad booking and Done-with-you brief. Work them left to right: reviewed, accepted,
            invoiced, paid, then enrolled.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void refresh()} busy={busy}>Refresh</Button>
      </div>

      {message && <div className="mb-6"><Notice tone={message.tone}>{message.text}</Notice></div>}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-full bg-[var(--pg-alt)] p-1">
          {['all', 'new', 'reviewed', 'accepted', 'invoiced', 'paid', 'enrolled', 'declined'].map((key) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`rounded-full px-4 py-2 text-[13.5px] transition-colors cursor-pointer ${
                status === key ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'hover:bg-[var(--pg-card)]'
              }`}
            >
              {key === 'all' ? 'All' : APPLICATION_STATUS_LABEL[key as ApplicationStatus]}
              {key !== 'all' && counts.get(key) ? ` ${counts.get(key)}` : ''}
            </button>
          ))}
        </div>
        {!programFilter && (
          <Select value={program} onChange={(event) => setProgram(event.target.value)} className="max-w-[190px]">
            <option value="all">All programs</option>
            <option value="foundry">Foundry</option>
            <option value="launchpad">Launchpad</option>
            <option value="general">Other</option>
          </Select>
        )}
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pg-body)]" />
          <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or business" className="pl-10" />
        </div>
      </div>

      {!rows ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing in this view"
          body={rows.length ? 'No applications match this filter.' : 'Applications and bookings land here the moment someone submits the form.'}
        />
      ) : (
        <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
          {filtered.map((row) => {
            const open = openId === row.id;
            const answers = Object.entries(row.answers ?? {}).filter(([, value]) => String(value ?? '').trim());
            return (
              <li key={row.id}>
                <button
                  onClick={() => setOpenId(open ? null : row.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 text-left cursor-pointer hover:bg-[var(--pg-alt)]/50"
                  aria-expanded={open}
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--pg-body)] transition-transform ${open ? 'rotate-180' : ''}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="block truncate text-[13px] text-[var(--pg-body)]">{row.email}</span>
                  </span>
                  <span className="hidden text-[13.5px] text-[var(--pg-body)] sm:block">
                    {PROGRAM_NAME[row.program as ProgramKey] ?? 'Breadmaker'}
                    {row.tier ? ` · ${TIER_LABEL[row.tier] ?? row.tier}` : ''}
                  </span>
                  <span className="hidden text-[13.5px] text-[var(--pg-body)] lg:block">
                    {row.cohortLabel || 'No cohort'}{row.startsOn ? ` · ${formatProgramDate(row.startsOn)}` : ''}
                  </span>
                  <Chip tone={STATUS_TONES[row.status] ?? 'neutral'}>{APPLICATION_STATUS_LABEL[row.status as ApplicationStatus] ?? row.status}</Chip>
                </button>

                {open && (
                  <div className="border-t border-[var(--pg-line-soft)] bg-[var(--pg-alt)]/40 px-6 py-6">
                    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                      {row.company && (
                        <div>
                          <dt className="font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]">Business</dt>
                          <dd className="mt-1 text-[14.5px]">{row.company}</dd>
                        </div>
                      )}
                      {row.phone && (
                        <div>
                          <dt className="font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]">Phone</dt>
                          <dd className="mt-1 text-[14.5px]">{row.phone}</dd>
                        </div>
                      )}
                      {answers.map(([key, value]) => (
                        <div key={key} className="sm:col-span-2">
                          <dt className="font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]">{questionLabel(row.program, key)}</dt>
                          <dd className="mt-1 whitespace-pre-line text-[14.5px] leading-[1.55]">{String(value)}</dd>
                        </div>
                      ))}
                      <div>
                        <dt className="font-label font-medium text-[11px] uppercase tracking-[0.06em] text-[var(--pg-body)]">Submitted</dt>
                        <dd className="mt-1 text-[14.5px]">{new Date(row.createdAt).toLocaleString()}</dd>
                      </div>
                    </dl>

                    {row.program === 'launchpad' && <BuildBriefPanel applicationId={row.id} canEdit={canEdit} />}

                    {canEdit && (
                      <div className="mt-6 grid gap-4 border-t border-[var(--pg-line-soft)] pt-6 lg:grid-cols-[1fr_auto] lg:items-end">
                        <Field label="Note (saved with the next change)">
                          <TextArea
                            rows={2}
                            value={row.note}
                            onChange={(event) => setRows((current) => (current ?? []).map((item) => (item.id === row.id ? { ...item, note: event.target.value } : item)))}
                            placeholder="Called on Tuesday, invoice sent, waiting on payment."
                          />
                        </Field>
                        <div className="flex flex-wrap gap-2 lg:pb-1">
                          {(NEXT_ACTIONS[row.status] ?? []).map((next) => (
                            <Button
                              key={next}
                              variant={next === 'declined' ? 'ghost' : 'accent'}
                              busy={busy}
                              onClick={() => void move(row, next, row.note)}
                            >
                              {next === 'enrolled' ? 'Mark enrolled' : `Mark ${APPLICATION_STATUS_LABEL[next].toLowerCase()}`}
                            </Button>
                          ))}
                          {(row.status === 'paid' || row.status === 'accepted' || row.status === 'invoiced') && (
                            <Button variant="dark" busy={busy} onClick={() => void enroll(row)}>
                              <Check className="h-4 w-4" /> Enroll in the Academy
                            </Button>
                          )}
                          <a
                            href={`mailto:${row.email}?subject=${encodeURIComponent(`Your Breadmaker ${PROGRAM_NAME[row.program as ProgramKey] ?? ''} application`)}`}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--pg-line)] px-5 py-2.5 text-[14.5px] transition hover:bg-[var(--pg-card)]"
                          >
                            <Mail className="h-4 w-4" /> Email
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
