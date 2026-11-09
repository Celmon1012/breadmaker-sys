import React, { useEffect, useRef, useState } from 'react';

import { LifeBuoy, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hideChatWidget } from '../../lib/chat-widget';
import { errorMessage } from '../../lib/lms';
import { sendTicket } from '../../lib/support';
import { COACH_QUESTION_MAX, CoachMessage, STUCK_OPTIONS, StuckOn, askCoach, clearCoachThread, loadCoachThread } from '../../lib/tutor';
import { Button, Notice, TextArea } from './lms-ui';

interface CoachPanelProps {
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  courseSlug: string;
  key?: React.Key;
}

/** "Stuck?" in the lesson player: a coach that knows the open session, asks what you tried, and hints before it explains. */
export default function CoachPanel({ lessonId, lessonTitle, courseTitle, courseSlug }: CoachPanelProps) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<CoachMessage[] | null>(null);
  const [stuckOn, setStuckOn] = useState<StuckOn | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [lift, setLift] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  const email = session?.user.email ?? '';
  const name = String(session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? '');

  // The lesson coach is the chat on this page, so the site-wide support widget steps aside.
  useEffect(() => hideChatWidget(), []);

  // Earlier exchange for this session, loaded the first time the panel opens.
  useEffect(() => {
    if (!open || thread !== null) return;
    let cancelled = false;
    loadCoachThread(lessonId)
      .then((rows) => !cancelled && setThread(rows))
      .catch(() => !cancelled && setThread([]));
    return () => {
      cancelled = true;
    };
  }, [open, thread, lessonId]);

  // Rides above the site footer instead of covering its links when the page is scrolled to the end.
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setLift(Math.max(0, Math.round(window.innerHeight - footer.getBoundingClientRect().top)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.length, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!email) return null;

  const messages = thread ?? [];
  const lastReply = [...messages].reverse().find((m) => m.role === 'assistant');
  const offerCoach = !!lastReply?.needsCoach;

  const send = async () => {
    const question = draft.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    setHandoff('idle');
    const pending: CoachMessage = { id: -Date.now(), role: 'user', content: question, needsCoach: false };
    setThread((prev) => [...(prev ?? []), pending]);
    setDraft('');
    try {
      const result = await askCoach({ lessonId, question, stuckOn: stuckOn ?? undefined });
      setStuckOn(null);
      setThread((prev) => [...(prev ?? []), { id: -Date.now() - 1, role: 'assistant', content: result.reply, needsCoach: result.needsCoach }]);
    } catch (err) {
      setThread((prev) => (prev ?? []).filter((m) => m.id !== pending.id));
      setDraft(question);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!window.confirm('Delete this conversation? The coach will start fresh on this session.')) return;
    try {
      await clearCoachThread(lessonId);
      setThread([]);
      setError(null);
      setHandoff('idle');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const sendToCoach = async () => {
    setHandoff('sending');
    setError(null);
    const lines = messages.slice(-6).map((m) => `${m.role === 'user' ? 'Me' : 'Coach'}: ${m.content}`);
    if (draft.trim()) lines.push(`Me (not asked yet): ${draft.trim()}`);
    const recent = lines.join('\n\n') || '(No messages yet.)';
    try {
      await sendTicket({
        email,
        name,
        category: 'course',
        subject: `Stuck: ${lessonTitle}`.slice(0, 120),
        message: `${courseTitle} — ${lessonTitle}\n${window.location.origin}/learn/${courseSlug}/${lessonId}\n\nThe lesson coach suggested a person look at this. Recent messages:\n\n${recent}`,
      });
      setHandoff('sent');
    } catch (err) {
      setHandoff('idle');
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ bottom: 20 + lift }}
        className="fixed right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--pg-ink)] px-5 py-3 text-[14.5px] font-semibold text-[var(--pg-bg)] transition-transform active:scale-[0.97] hover:opacity-90 cursor-pointer"
      >
        <LifeBuoy className="h-4 w-4" /> Stuck?
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Lesson coach">
          <button className="absolute inset-0 bg-black/30" aria-label="Close the coach" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-[var(--pg-line-soft)] bg-[var(--pg-bg)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--pg-line-soft)] px-5 py-4">
              <div className="min-w-0">
                <p className="font-label text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Lesson coach</p>
                <p className="mt-1 truncate font-editorial text-[19px] font-semibold leading-[1.25]">{lessonTitle}</p>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={clear} className="rounded-full p-2 hover:bg-[var(--pg-alt)] cursor-pointer" aria-label="Delete this conversation" title="Delete this conversation">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-[var(--pg-alt)] cursor-pointer" aria-label="Close the coach">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {thread === null ? (
                <p className="text-[14.5px] text-[var(--pg-body)]">Loading…</p>
              ) : messages.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-[15px] leading-[1.6]">
                    I know this session, its one action and what done looks like. Tell me what you tried and what happened, and I will point you to the next step. I will not do it for you.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {STUCK_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={stuckOn === option.value}
                        onClick={() => setStuckOn(stuckOn === option.value ? null : option.value)}
                        className={`rounded-full border px-3.5 py-2 text-left text-[13.5px] leading-[1.3] cursor-pointer transition-colors ${
                          stuckOn === option.value ? 'border-[var(--pg-ink)] bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'border-[var(--pg-line)] hover:bg-[var(--pg-alt)]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[12.5px] leading-[1.5] text-[var(--pg-body)]">Never paste a password, key or token here.</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={`max-w-[88%] whitespace-pre-wrap rounded-[16px] px-4 py-3 text-[15px] leading-[1.6] ${
                        message.role === 'user' ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'border border-[var(--pg-line-soft)] bg-[var(--pg-card)]'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))
              )}
              {busy && <p className="text-[14px] text-[var(--pg-body)]">The coach is thinking…</p>}
              {offerCoach && (
                <Notice>
                  {handoff === 'sent' ? (
                    'Sent to your coach. We reply by email.'
                  ) : (
                    <div className="space-y-3">
                      <p>This one is better with a person. Send this conversation to your coach?</p>
                      <Button variant="dark" busy={handoff === 'sending'} onClick={sendToCoach}>Send to my coach</Button>
                    </div>
                  )}
                </Notice>
              )}
              {error && <Notice tone="error">{error}</Notice>}
              <div ref={endRef} />
            </div>

            <div className="border-t border-[var(--pg-line-soft)] px-5 py-4">
              <TextArea
                autoFocus
                rows={3}
                value={draft}
                maxLength={COACH_QUESTION_MAX}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder="What did you try, and what happened?"
                aria-label="Your message to the coach"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={sendToCoach}
                  disabled={handoff !== 'idle'}
                  className="text-[13px] text-[var(--pg-body)] underline underline-offset-2 hover:text-[var(--pg-ink)] disabled:no-underline disabled:opacity-60 cursor-pointer"
                >
                  {handoff === 'sent' ? 'Sent to your coach' : 'Message my coach instead'}
                </button>
                <Button onClick={send} busy={busy} disabled={!draft.trim()}>
                  <Send className="h-4 w-4" /> Ask
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
