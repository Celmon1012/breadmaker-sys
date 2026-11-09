import React, { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../lib/lms';
import { EvidenceItem, ReviewRow, STATUS_LABEL, loadReviewQueue, loadSubmissionEvidence, reviewSubmission } from '../../lib/evidence';
import { Button, CARD, Chip, EmptyState, Loading, Notice, Select, TextArea } from './lms-ui';
import { EvidenceList } from './EvidenceBox';

/** Studio: evidence learners have sent for their actions. Pass it or send it back with a note. */

const dateOnly = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const ReviewCard: React.FC<{ row: ReviewRow; canEdit: boolean; onDone: () => void; onError: (text: string) => void }> = ({ row, canEdit, onDone, onError }) => {
  const [evidence, setEvidence] = useState<EvidenceItem[] | null>(null);
  const [note, setNote] = useState(row.status === 'needs_revision' ? row.reviewNote : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSubmissionEvidence(row.submissionId)
      .then((items) => !cancelled && setEvidence(items))
      .catch((err) => {
        if (cancelled) return;
        setEvidence([]);
        onError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [row.submissionId]);

  const review = async (status: 'passed' | 'needs_revision') => {
    if (status === 'needs_revision' && !note.trim()) {
      onError('Tell the learner what to fix before you send it back.');
      return;
    }
    setBusy(true);
    try {
      await reviewSubmission(row.submissionId, status, status === 'passed' ? note : note.trim());
      onDone();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`${CARD} px-6 py-5`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{row.lessonTitle}</span>
        <Chip tone={row.status === 'passed' ? 'accent' : row.status === 'needs_revision' ? 'dark' : 'neutral'}>{STATUS_LABEL[row.status]}</Chip>
        <span className="ml-auto text-[13px] text-[var(--pg-body)]">{dateOnly(row.submittedAt)}</span>
      </div>
      <p className="mt-1 text-[13.5px] text-[var(--pg-body)]">
        {row.courseTitle} · {row.fullName ? `${row.fullName} · ` : ''}
        <a className="underline underline-offset-2" href={`mailto:${row.email}?subject=${encodeURIComponent('Your ' + row.lessonTitle + ' evidence')}`}>{row.email}</a>
      </p>
      <div className="mt-4">
        {evidence === null ? <p className="text-[14px] text-[var(--pg-body)]">Loading evidence…</p> : evidence.length === 0 ? <p className="text-[14px] text-[var(--pg-body)]">No evidence items.</p> : <EvidenceList items={evidence} onError={onError} />}
      </div>
      {canEdit && (
        <div className="mt-4 space-y-3">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note the learner sees. Required when you send it back." />
          <div className="flex flex-wrap gap-3">
            <Button busy={busy} onClick={() => void review('passed')} disabled={row.status === 'passed'}>Pass</Button>
            <Button variant="ghost" busy={busy} onClick={() => void review('needs_revision')}>Send back to fix</Button>
          </div>
        </div>
      )}
      {!canEdit && row.reviewNote && <p className="mt-3 whitespace-pre-line text-[14.5px] text-[var(--pg-body)]">{row.reviewNote}</p>}
    </li>
  );
};

export default function ReviewsSection({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [filter, setFilter] = useState<'waiting' | 'all'>('waiting');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    loadReviewQueue()
      .then((items) => {
        setRows(items);
        setError(null);
      })
      .catch((err) => {
        setRows([]);
        setError(errorMessage(err));
      });
  }, []);
  useEffect(load, [load]);

  const shown = (rows ?? []).filter((row) => filter === 'all' || row.status === 'submitted');
  const waiting = (rows ?? []).filter((row) => row.status === 'submitted').length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Reviews</h1>
          <p className="mt-3 max-w-[560px] text-[16px] leading-[1.55] text-[var(--pg-body)]">
            Evidence learners sent for their actions{rows ? `. ${waiting} waiting.` : '.'} Pass what meets the done-when check, and send the rest back with one clear fix.
          </p>
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as 'waiting' | 'all')} className="max-w-[190px]">
          <option value="waiting">Waiting for review</option>
          <option value="all">Everything</option>
        </Select>
      </div>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {rows === null ? (
        <Loading />
      ) : shown.length === 0 ? (
        <EmptyState title="Nothing to review" body="When a learner sends evidence for an action, it shows up here." />
      ) : (
        <ul className="space-y-3">
          {shown.map((row) => (
            <ReviewCard key={row.submissionId} row={row} canEdit={canEdit} onDone={load} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
}
