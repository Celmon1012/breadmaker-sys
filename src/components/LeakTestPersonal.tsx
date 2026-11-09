import React, { useEffect, useState } from 'react';
import {
  Access,
  AiReport,
  ReportContent,
  generateAiReport,
  saveIntake,
} from '../lib/leak-test-api';
import { CALL_BOOKING_URL, REPLY_TIME } from '../lib/program-config';

/**
 * The parts of the Business Leak Test report that are written for one business: the three
 * intake questions, the AI-written plan (or its waiting states) and the review-call card.
 */

const MUTED = 'text-[var(--pg-body)]';
const H2 = 'mt-12 font-editorial text-[26px] font-semibold tracking-[-0.01em] sm:text-[30px] break-after-avoid';
const EYEBROW = 'text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]';
const FIELD =
  'mt-2 w-full rounded-[11px] border border-[var(--pg-line)] bg-transparent px-4 py-3.5 text-[16px] leading-[1.5] font-normal text-[var(--pg-ink)] placeholder:text-[var(--pg-body)]/60 focus:border-[var(--pg-accent)] focus:outline-none';
const BTN =
  'inline-flex items-center justify-center rounded-full bg-[var(--pg-accent)] px-7 py-3.5 text-[16px] font-medium text-[var(--pg-accent-ink)] cursor-pointer disabled:opacity-60';
const WRAP = 'mt-12 rounded-[17px] border border-[var(--pg-accent)] p-6 sm:p-8 print:hidden';

interface PersonalSectionProps {
  access: Access;
  report: ReportContent;
  ranked: { id: string; name: string }[];
  onChange: () => Promise<unknown>;
}

/** Three questions to unlock the personal plan, or the plan itself once it is written. */
export function PersonalSection({ access, report, ranked, onChange }: PersonalSectionProps) {
  const [form, setForm] = useState({ about: '', frustration: '', tried: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = report.ai_status;
  const callTier = !!report.call;
  const names = new Map(ranked.map((r) => [r.id, r.name]));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveIntake(access, form);
      // The status becomes 'pending', which starts the writer below.
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      await generateAiReport(access);
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A plan that is queued gets written as soon as someone opens the report. The writer claims the
  // job, so opening the page twice, or after the team re-queues it, never writes it twice.
  useEffect(() => {
    if (status !== 'pending') return;
    generateAiReport(access).catch((err) => setError((err as Error).message));
  }, [status, access]);

  if (status === 'ready' && report.ai) return <AiSection ai={report.ai} names={names} callTier={callTier} />;

  if (status === 'pending' || status === 'generating') {
    return (
      <div className={WRAP} role="status">
        <p className={EYEBROW}>Your personal plan</p>
        <p className="mt-3 text-[20px] font-semibold">We are writing it from your answers now.</p>
        <p className={`mt-2 text-[16px] leading-[1.6] ${MUTED}`}>This takes about a minute. You can keep reading, and it will appear here.</p>
        {error && <p className="mt-3 text-[15px]">{error}</p>}
      </div>
    );
  }

  if (status === 'review') {
    return (
      <div className={WRAP} role="status">
        <p className={EYEBROW}>Your personal plan</p>
        <p className="mt-3 text-[20px] font-semibold">It is written and our team is checking it.</p>
        <p className={`mt-2 text-[16px] leading-[1.6] ${MUTED}`}>
          Because your report includes a review call, we read your plan before you do. Come back to this link within {REPLY_TIME}.
        </p>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={WRAP}>
        <p className={EYEBROW}>Your personal plan</p>
        <p className="mt-3 text-[20px] font-semibold">We could not finish writing it.</p>
        <p className={`mt-2 text-[16px] leading-[1.6] ${MUTED}`}>
          Your answers are saved. Try again, and if it still fails, reply to your report email.
        </p>
        {error && <p className="mt-3 text-[15px]">{error}</p>}
        <button onClick={retry} disabled={busy} className={`${BTN} mt-5`}>
          {busy ? 'Trying…' : 'Try again'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={WRAP}>
      <p className={EYEBROW}>Make this report yours</p>
      <h2 className="mt-3 font-editorial text-[26px] font-semibold leading-[1.15] tracking-[-0.01em] sm:text-[30px]">
        Three questions, then we write a plan for your business.
      </h2>
      <p className={`mt-2 text-[16px] leading-[1.6] ${MUTED}`}>
        The scores above are the same for any business that gave your answers. Your own words are what make the plan specific to you.
      </p>
      <label className="mt-6 block text-[16px] font-semibold">
        What does the business do, and for whom?
        <textarea
          required
          rows={3}
          maxLength={1200}
          value={form.about}
          onChange={(e) => setForm({ ...form, about: e.target.value })}
          placeholder="e.g. We bake and deliver cakes for birthdays and offices in Lekki."
          className={FIELD}
        />
      </label>
      <label className="mt-5 block text-[16px] font-semibold">
        What frustrates you most right now?
        <textarea
          rows={3}
          maxLength={1200}
          value={form.frustration}
          onChange={(e) => setForm({ ...form, frustration: e.target.value })}
          placeholder="e.g. Orders arrive on WhatsApp and I lose track of who has paid."
          className={FIELD}
        />
      </label>
      <label className="mt-5 block text-[16px] font-semibold">
        What have you already tried?
        <textarea
          rows={3}
          maxLength={1200}
          value={form.tried}
          onChange={(e) => setForm({ ...form, tried: e.target.value })}
          placeholder="e.g. A spreadsheet, and asking my sister to help on weekends."
          className={FIELD}
        />
      </label>
      {error && (
        <p role="alert" className="mt-4 rounded-[11px] border border-[var(--pg-accent)] px-4 py-3 text-[15px]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !form.about.trim()} className={`${BTN} mt-6`}>
        {busy ? 'Saving…' : 'Write my plan'}
      </button>
      <p className={`mt-4 text-[13.5px] leading-[1.6] ${MUTED}`}>
        Please do not include passwords or bank details. Your answers are used only to write this report.
        {callTier ? ' Because your report includes a call, our team checks your plan before you see it.' : ''}
      </p>
    </form>
  );
}

function AiSection({ ai, names, callTier }: { ai: AiReport; names: Map<string, string>; callTier: boolean }) {
  return (
    <>
      <h2 className={H2}>Your plan, written for your business</h2>
      <p className="mt-3 font-editorial text-[24px] font-semibold leading-[1.25] tracking-[-0.01em]">{ai.headline}</p>
      <p className={`mt-3 text-[16px] leading-[1.65] ${MUTED}`}>{ai.business_snapshot}</p>

      {ai.why_these_leaks.length > 0 && (
        <ul className="mt-6 space-y-4">
          {ai.why_these_leaks.map((w) => (
            <li key={w.pillar} className="break-inside-avoid rounded-[12px] border border-[var(--pg-line-soft)] p-5">
              <p className={EYEBROW}>{names.get(w.pillar) ?? w.pillar}</p>
              <p className="mt-2 text-[16px] leading-[1.65]">{w.why_for_you}</p>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-8 text-[19px] font-bold break-after-avoid">Your first week</h3>
      <ol className="mt-3 space-y-3">
        {ai.first_week.map((action, i) => (
          <li key={i} className="flex gap-3 text-[16px] leading-[1.6]">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--pg-dark)] text-[13px] font-semibold text-[var(--pg-dark-ink)]">
              {i + 1}
            </span>
            <span>{action}</span>
          </li>
        ))}
      </ol>

      <h3 className="mt-8 text-[19px] font-bold break-after-avoid">Your 30 days, week by week</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {ai.thirty_day_plan.map((week) => (
          <div key={week.week} className="break-inside-avoid rounded-[12px] border border-[var(--pg-line-soft)] p-5">
            <p className={EYEBROW}>Week {week.week}</p>
            <p className="mt-1 text-[17px] font-bold">{week.focus}</p>
            <ul className="mt-3 space-y-2">
              {week.actions.map((action, i) => (
                <li key={i} className="flex gap-2.5 text-[15.5px] leading-[1.6]">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--pg-accent)]" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {ai.watch_outs.length > 0 && (
        <>
          <h3 className="mt-8 text-[19px] font-bold break-after-avoid">Watch out for</h3>
          <ul className="mt-3 space-y-2">
            {ai.watch_outs.map((item, i) => (
              <li key={i} className="text-[16px] leading-[1.65]">
                {item}
              </li>
            ))}
          </ul>
        </>
      )}

      {callTier && ai.questions_for_call.length > 0 && (
        <>
          <h3 className="mt-8 text-[19px] font-bold break-after-avoid">Questions to bring to your call</h3>
          <ul className="mt-3 space-y-2">
            {ai.questions_for_call.map((item, i) => (
              <li key={i} className="text-[16px] leading-[1.65]">
                {item}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={`mt-6 text-[13px] leading-[1.6] ${MUTED}`}>
        This plan was drafted with AI from your answers. It is a starting point, not professional advice. For money, tax or
        legal questions, speak to a qualified professional.
      </p>
    </>
  );
}

/** The Report + call tier's booking card, shown inside the report's "next step" panel. */
export function CallCard({ call, contact, submissionId }: { call: ReportContent['call']; contact: { name: string; email: string }; submissionId: string }) {
  const href = CALL_BOOKING_URL
    ? `${CALL_BOOKING_URL}${CALL_BOOKING_URL.includes('?') ? '&' : '?'}${new URLSearchParams({
        name: contact.name,
        email: contact.email,
        notes: `Business Leak Test review call. Result ${submissionId}`,
      }).toString()}`
    : '';
  const status = call?.status ?? 'to_book';
  return (
    <div className="mt-6 border-t border-white/15 pt-6">
      <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-label-dark)]">Your review call</p>
      {status === 'done' ? (
        <p className="mt-2 text-[15px] leading-[1.6] text-[var(--pg-dark-body)]">
          Your review call is done. Reply to your report email if you want to talk about next steps.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[15px] leading-[1.6] text-[var(--pg-dark-body)]">
            {status === 'booked'
              ? 'Your 30-minute call is booked. Use the link below to change the time.'
              : 'Your 30-minute review call is included. Pick a time that suits you and we will go through this report together.'}
          </p>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-[var(--pg-accent)] px-7 py-3.5 text-[16px] font-medium text-[var(--pg-accent-ink)]"
            >
              {status === 'booked' ? 'Change my time' : 'Book my call'}
            </a>
          ) : (
            <p className="mt-2 text-[15px] leading-[1.6] text-[var(--pg-dark-body)]">
              Reply to your report email with two or three times that suit you. We reply within {REPLY_TIME}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
