import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Link2, ShieldCheck } from 'lucide-react';
import { errorMessage } from '../../lib/lms';
import {
  EvidenceItem,
  FILE_TYPES,
  MAX_FILES,
  NOTE_MAX,
  STATUS_LABEL,
  Submission,
  evidenceFileUrl,
  loadSubmission,
  parseLinks,
  submitEvidence,
} from '../../lib/evidence';
import { Button, CARD, Chip, Field, Notice, TextArea } from './lms-ui';

interface EvidenceBoxProps {
  lessonId: string;
  userId: string;
  /** Called after a new submission, so the lesson shows as done and the outline can refresh. */
  onSubmitted: () => void;
}

export function EvidenceList({ items, onError }: { items: EvidenceItem[]; onError?: (text: string) => void }) {
  const open = async (path: string) => {
    try {
      window.open(await evidenceFileUrl(path), '_blank', 'noopener');
    } catch (err) {
      onError?.(errorMessage(err));
    }
  };
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2.5 text-[15px] leading-[1.5]">
          {item.kind === 'link' ? <Link2 className="mt-[3px] h-4 w-4 shrink-0" /> : item.kind === 'file' ? <FileText className="mt-[3px] h-4 w-4 shrink-0" /> : <ShieldCheck className="mt-[3px] h-4 w-4 shrink-0" />}
          {item.kind === 'link' ? (
            <a href={item.value} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">{item.value}</a>
          ) : item.kind === 'file' && item.storagePath ? (
            <button type="button" onClick={() => void open(item.storagePath!)} className="text-left underline underline-offset-2 cursor-pointer">{item.value}</button>
          ) : (
            <span className="whitespace-pre-line">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Under "Your one action": show the work, get it passed by a coach. */
export default function EvidenceBox({ lessonId, userId, onSubmitted }: EvidenceBoxProps) {
  const [submission, setSubmission] = useState<Submission | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [linksText, setLinksText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSubmission(undefined);
    setEditing(false);
    setNote('');
    setLinksText('');
    setFiles([]);
    setError(null);
    loadSubmission(lessonId, userId).then((value) => !cancelled && setSubmission(value));
    return () => {
      cancelled = true;
    };
  }, [lessonId, userId]);

  if (submission === undefined) return null;

  const status = submission?.status ?? null;
  const showForm = !submission || editing || status === 'needs_revision';

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitEvidence({ userId, lessonId, note, links: parseLinks(linksText), files });
      setSubmission(await loadSubmission(lessonId, userId));
      setEditing(false);
      setNote('');
      setLinksText('');
      setFiles([]);
      onSubmitted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${CARD} p-7`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 font-label font-semibold text-[11.5px] uppercase tracking-[0.06em] text-[var(--pg-accent)]">
          <ShieldCheck className="h-4 w-4" /> Show it works
        </p>
        {status && <Chip tone={status === 'passed' ? 'accent' : status === 'needs_revision' ? 'dark' : 'neutral'}>{STATUS_LABEL[status]}</Chip>}
      </div>

      {status === 'passed' && (
        <p className="mt-3 inline-flex items-center gap-2 text-[15px] leading-[1.55]">
          <CheckCircle2 className="h-4 w-4 text-[var(--pg-accent)]" /> Your coach confirmed this works.
        </p>
      )}
      {status === 'needs_revision' && submission?.reviewNote && (
        <div className="mt-4">
          <Notice>
            <p className="font-medium">Your coach asks you to fix this first:</p>
            <p className="mt-1 whitespace-pre-line">{submission.reviewNote}</p>
          </Notice>
        </div>
      )}
      {!submission && (
        <p className="mt-3 text-[15px] leading-[1.6] text-[var(--pg-body)]">
          When the "done when" check is true, show it here: a note on what you did, a link, or a screenshot. Your coach checks it and tells you if it passes.
        </p>
      )}

      {submission && submission.evidence.length > 0 && !showForm && (
        <div className="mt-4">
          <EvidenceList items={submission.evidence} onError={setError} />
        </div>
      )}

      {showForm && (
        <div className="mt-5 space-y-4">
          {status === 'needs_revision' && <p className="text-[14px] text-[var(--pg-body)]">Fix it, then send your evidence again. It replaces what you sent before.</p>}
          <Field label="What you did and what you saw" hint="Plain words are fine. Never paste a password, key or token.">
            <TextArea rows={3} value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="For example: I tested the payment link from my phone and the confirmation email arrived in 2 minutes." />
          </Field>
          <Field label="Links (optional)" hint="One per line, up to 5. Start with https://">
            <TextArea rows={2} value={linksText} onChange={(e) => setLinksText(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Screenshots or a PDF (optional)" hint={`Up to ${MAX_FILES} files, 10MB each. JPG, PNG, WebP or PDF.`}>
            <input
              type="file"
              multiple
              accept={Object.keys(FILE_TYPES).join(',')}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, MAX_FILES))}
              className="block w-full text-[14px] file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-[var(--pg-line)] file:bg-transparent file:px-4 file:py-2 file:text-[13.5px]"
            />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-3">
            <Button busy={busy} disabled={!note.trim() && !linksText.trim() && files.length === 0} onClick={send}>
              {status === 'needs_revision' ? 'Send again' : 'Send to my coach'}
            </Button>
            {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </div>
      )}

      {!showForm && error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {!showForm && status === 'submitted' && (
        <div className="mt-4">
          <Button variant="ghost" onClick={() => setEditing(true)}>Replace my evidence</Button>
        </div>
      )}
    </div>
  );
}
