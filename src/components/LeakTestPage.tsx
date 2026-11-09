import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Cpu, Funnel, Tag, Users, Wallet, Workflow } from 'lucide-react';
import { Route } from '../types';
import { usePrice } from '../lib/use-price';
import {
  ANSWERS,
  BAND_COPY,
  LEAK_AREAS,
  LeakProfile,
  LeakResult,
  PROFILE_QUESTIONS,
  QUESTIONS,
  emptyProfile,
  scoreLeakTest,
} from '../lib/leak-test';
import {
  Access,
  PaidTier,
  ReportOffer,
  ReportPrice,
  accessFromUrl,
  getLeakTest,
  getReportOffers,
  listReportPrices,
  notifyLeak,
  redeemCode,
  startReportCheckout,
  submitLeakTest,
} from '../lib/leak-test-api';
import { SHARE_URL, canvasToBlob, drawShareCard, shareText } from '../lib/leak-share';
import { trackEvent } from '../lib/metrics';
import { money, paymentsEnabled } from '../lib/payments';
import { KitOffer, listKitOffers } from '../lib/kits';
import { coursePath, programForSystem, systemForPillar } from '../lib/systems';
import { PROOF_LABEL, agentForPillar, liveAgentLine } from '../lib/leak-agents';
import LeakTestReport from './LeakTestReport';
import { BREADMAKER_THEME, ProgramFooter, ProgramNav, themeStyle } from './program-ui';

interface LeakTestPageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
  /** The path segment after /leak-test: "result" or "report". */
  section?: string;
}

const BTN =
  'inline-flex items-center justify-center rounded-full bg-[var(--pg-accent)] px-9 py-5 text-[18px] font-medium text-[var(--pg-accent-ink)] transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer';
const GHOST =
  'inline-flex items-center justify-center rounded-full border border-[var(--pg-line)] px-7 py-4 text-[16px] font-medium text-[var(--pg-ink)] transition-colors hover:bg-black/5 cursor-pointer';
const INPUT =
  'w-full rounded-[11px] border border-[var(--pg-line)] bg-transparent px-4 py-3.5 text-[17px] text-[var(--pg-ink)] placeholder:text-[var(--pg-body)]/60 focus:border-[var(--pg-accent)] focus:outline-none';
const LABEL = 'mb-2 block text-[15px] font-medium text-[var(--pg-ink)]';
const AREA_ICONS: Record<string, typeof Tag> = {
  offer: Tag,
  sales: Funnel,
  operations: Workflow,
  cash: Wallet,
  team: Users,
  tech: Cpu,
};

/** Used for the "time left" estimate: 30 questions at this pace is the four minutes the intro promises. */
const SECONDS_PER_QUESTION = 8;

const EYEBROW = 'font-label text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]';

type Stage = 'intro' | 'profile' | 'quiz' | 'gate' | 'result';

export default function LeakTestPage({ onNavigate, openPath, section }: LeakTestPageProps) {
  const [stage, setStage] = useState<Stage>('intro');
  const [profile, setProfile] = useState<LeakProfile>(emptyProfile);
  const [answers, setAnswers] = useState<number[]>([]);
  const [access, setAccess] = useState<Access | null>(null);
  const [paidTier, setPaidTier] = useState<PaidTier | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(section === 'result');
  const [savedError, setSavedError] = useState<string | null>(null);

  // /leak-test/result?s=&t= (from the email, or this browser's saved result) reloads a finished result.
  useEffect(() => {
    if (section !== 'result') return;
    const found = accessFromUrl();
    if (!found) {
      setSavedError('We could not find a saved result in this browser. Take the test again, or use the link in your email.');
      setLoadingSaved(false);
      return;
    }
    getLeakTest(found)
      .then((stored) => {
        if (!stored) throw new Error('We could not find that result.');
        setAnswers(stored.answers);
        setProfile(stored.profile);
        setAccess(found);
        setPaidTier(stored.paid_tier);
        setStage('result');
      })
      .catch((err) => setSavedError((err as Error).message))
      .finally(() => setLoadingSaved(false));
  }, [section]);

  const start = () => {
    trackEvent('leaktest_start');
    setAnswers([]);
    setAccess(null);
    setPaidTier(null);
    setStage('profile');
    window.scrollTo({ top: 0 });
  };

  const answer = (points: number) => {
    const next = [...answers, points];
    setAnswers(next);
    if (next.length === QUESTIONS.length) {
      setStage('gate');
      window.scrollTo({ top: 0 });
    }
  };

  if (section === 'report') {
    return (
      <Shell onNavigate={onNavigate} wide>
        <LeakTestReport onNavigate={onNavigate} openPath={openPath} />
      </Shell>
    );
  }

  return (
    <Shell onNavigate={onNavigate}>
      {loadingSaved && <p className="pt-24 text-[18px] text-[var(--pg-body)]">Loading your result…</p>}

      {!loadingSaved && savedError && (
        <section className="pt-20">
          <p className="max-w-[600px] text-[20px] leading-[1.5]">{savedError}</p>
          <button onClick={start} className={`${BTN} mt-8`}>
            Take the test
          </button>
        </section>
      )}

      {!loadingSaved && !savedError && stage === 'intro' && <Intro onStart={start} onNavigate={onNavigate} />}

      {stage === 'profile' && <Profile profile={profile} onChange={setProfile} onBack={() => setStage('intro')} onNext={() => setStage('quiz')} />}

      {stage === 'quiz' && (
        <Quiz
          index={answers.length}
          onAnswer={answer}
          onBack={() => (answers.length === 0 ? setStage('profile') : setAnswers(answers.slice(0, -1)))}
        />
      )}

      {stage === 'gate' && (
        <Gate
          answers={answers}
          profile={profile}
          onBack={() => {
            setAnswers(answers.slice(0, -1));
            setStage('quiz');
          }}
          onDone={(found) => {
            setAccess(found);
            setStage('result');
            window.scrollTo({ top: 0 });
          }}
        />
      )}

      {stage === 'result' && !savedError && (
        <FreeResult
          answers={answers}
          access={access}
          paidTier={paidTier}
          onUnlocked={(tier) => setPaidTier(tier)}
          onRetake={start}
          openPath={openPath}
          onNavigate={onNavigate}
        />
      )}
    </Shell>
  );
}

function Shell({ children, onNavigate, wide }: { children: React.ReactNode; onNavigate: (route: Route) => void; wide?: boolean }) {
  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="flex min-h-screen flex-col bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)] antialiased print:bg-white">
      <div className="print:hidden">
        <ProgramNav
          announcement={false}
          brand="Breadmaker"
          accentWord="Systems"
          onBrand={() => onNavigate('home')}
          links={[
            { id: 'site', label: 'Back to homepage', back: true, onClick: () => onNavigate('home') },
          ]}
        />
      </div>
      <div className={`mx-auto w-full flex-1 px-6 pb-24 pt-6 ${wide ? 'max-w-[1312px]' : 'max-w-[1000px]'}`}>{children}</div>
      <div className="print:hidden">
        <ProgramFooter onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function Intro({ onStart, onNavigate }: { onStart: () => void; onNavigate: (route: Route) => void }) {
  return (
    <section className="pt-4 sm:pt-6">
      <h1 className="text-[40px] font-editorial font-semibold leading-[1.02] tracking-[-0.02em] sm:text-[58px]">
        Where is your business leaking?
      </h1>
      <p className="mt-5 max-w-[760px] text-[16px] leading-[1.6] text-[var(--pg-body)] sm:text-[19px]">
        Thirty questions, about four minutes. You get a score out of 100, your archetype and the one area costing you
        the most.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {LEAK_AREAS.map((area) => (
          <div key={area.id} className="rounded-[17px] border border-[var(--pg-line)] bg-white p-5">
            {(() => {
              const Icon = AREA_ICONS[area.id] ?? Tag;
              return <Icon className="mb-3 h-7 w-7 text-[var(--pg-accent)]" strokeWidth={1.5} aria-hidden="true" />;
            })()}
            <p className="text-[18px] font-bold">{area.name}</p>
            <p className="mt-1.5 text-[16px] leading-[1.5] text-[var(--pg-body)]">{area.tagline}</p>
          </div>
        ))}
      </div>

      <button onClick={onStart} className={`${BTN} mt-8`}>
        Take the free test
      </button>
      <p className="mt-4 max-w-[560px] text-[15px] leading-[1.6] text-[var(--pg-body)]">
        A self-assessment to spot weak points, not a financial or legal audit. Answer for how things work today, not how
        you want them to.
      </p>
    </section>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-2 text-[18px] font-bold text-[var(--pg-ink)] transition-opacity hover:opacity-70 cursor-pointer"
    >
      <ArrowLeft className="h-5 w-5" aria-hidden /> Back
    </button>
  );
}

function Profile({
  profile,
  onChange,
  onBack,
  onNext,
}: {
  profile: LeakProfile;
  onChange: (profile: LeakProfile) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const complete = PROFILE_QUESTIONS.every((q) => profile[q.key]);
  return (
    <section className="pt-4">
      <p className={EYEBROW}>Before we start</p>
      <h2 className="mt-3 text-[36px] font-editorial font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[48px]">About your business</h2>
      <p className="mt-3 max-w-[560px] text-[17px] leading-[1.6] text-[var(--pg-body)]">
        Five quick questions. They are not scored. They let us compare you with businesses like yours.
      </p>
      <div className="mt-10 space-y-4">
        {PROFILE_QUESTIONS.map((q) => (
          <div key={q.key} className="rounded-[17px] border border-[var(--pg-line)] bg-white p-6">
            <label htmlFor={`profile-${q.key}`} className={LABEL}>
              {q.label}
            </label>
            <select
              id={`profile-${q.key}`}
              value={profile[q.key]}
              onChange={(e) => onChange({ ...profile, [q.key]: e.target.value })}
              className={`${INPUT} appearance-none`}
            >
              <option value="" className="text-black">
                Choose one
              </option>
              {q.options.map((option) => (
                <option key={option} value={option} className="text-black">
                  {option}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-between gap-4">
        <BackButton onBack={onBack} />
        <button onClick={onNext} disabled={!complete} className={BTN}>
          Start the questions
        </button>
      </div>
    </section>
  );
}

function Quiz({ index, onAnswer, onBack }: { index: number; onAnswer: (points: number) => void; onBack: () => void }) {
  const question = QUESTIONS[index];

  // Where this question sits inside its area, and where each area starts in the list of 30.
  const areaStart: Record<string, number> = {};
  let running = 0;
  for (const area of LEAK_AREAS) {
    areaStart[area.id] = running;
    running += area.questions.length;
  }
  const areaTotal = LEAK_AREAS.find((area) => area.id === question.areaId)?.questions.length ?? 5;
  const areaPosition = index - areaStart[question.areaId] + 1;
  // About eight seconds a question, which is how the "about four minutes" on the intro is worked out.
  const secondsLeft = (QUESTIONS.length - index) * SECONDS_PER_QUESTION;
  const timeLeft = secondsLeft <= 60 ? 'under a minute left' : `about ${Math.round(secondsLeft / 60)} min left`;

  // Keys 1-5 answer the question.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const match = ANSWERS[Number(event.key) - 1];
      if (match) onAnswer(match.points);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAnswer]);

  return (
    <section className="pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[14px] text-[var(--pg-body)]">
        <span className="font-medium text-[var(--pg-ink)]">
          {question.areaName} · {areaPosition} of {areaTotal}
        </span>
        <span>
          Question {index + 1} of {QUESTIONS.length} · {timeLeft}
        </span>
      </div>
      <div
        className="mt-4 flex gap-1.5"
        role="progressbar"
        aria-label="Leak Test progress"
        aria-valuemin={0}
        aria-valuemax={QUESTIONS.length}
        aria-valuenow={index}
        aria-valuetext={`Question ${index + 1} of ${QUESTIONS.length}, ${timeLeft}`}
      >
        {LEAK_AREAS.map((area) => {
          const total = area.questions.length;
          const done = Math.min(total, Math.max(0, index - areaStart[area.id]));
          return (
            <div key={area.id} className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--pg-line)]">
              <div className="h-full bg-[var(--pg-accent)] transition-all" style={{ width: `${(done / total) * 100}%` }} />
            </div>
          );
        })}
      </div>

      {areaPosition === 1 && (
        <p className="mt-6 text-[15px] leading-[1.5] text-[var(--pg-body)]">
          {index === 0 ? 'First area' : 'Next area'}: <span className="font-semibold text-[var(--pg-ink)]">{LEAK_AREAS.find((area) => area.id === question.areaId)?.name}</span>
          {' '}· {LEAK_AREAS.find((area) => area.id === question.areaId)?.tagline}
        </p>
      )}

      <h2 className={`${areaPosition === 1 ? 'mt-3' : 'mt-8'} min-h-[120px] font-editorial text-[32px] font-semibold leading-[1.15] tracking-[-0.01em] sm:text-[44px]`}>
        {question.text}
      </h2>
      <div className="mt-10 grid gap-3 sm:grid-cols-5">
        {ANSWERS.map((a, n) => (
          <button
            key={a.label}
            onClick={() => onAnswer(a.points)}
            className="rounded-[13px] border border-[var(--pg-line)] bg-white px-5 py-5 text-left text-[17px] font-medium transition-[transform,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-[var(--pg-accent)] active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 cursor-pointer"
          >
            <span className="block text-[13px] text-[var(--pg-body)]">{n + 1}</span>
            {a.label}
          </button>
        ))}
      </div>
      <div className="mt-8">
        <BackButton onBack={onBack} />
      </div>
    </section>
  );
}

function Gate({
  answers,
  profile,
  onBack,
  onDone,
}: {
  answers: number[];
  profile: LeakProfile;
  onBack: () => void;
  onDone: (access: Access) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '', consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = scoreLeakTest(answers);

  const set = (field: 'name' | 'email' | 'whatsapp') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: e.target.value }));
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()) || form.whatsapp.replace(/\D/g, '').length < 7) {
      setError('Please add your name, a valid email and your WhatsApp number.');
      return;
    }
    if (!form.consent) {
      setError('Please tick the box so we can send your result.');
      return;
    }
    setBusy(true);
    try {
      const access = await submitLeakTest({
        name: form.name.trim(),
        email: form.email.trim(),
        whatsapp: form.whatsapp.trim(),
        consent: true,
        answers,
        profile,
        archetype: result.archetype.name,
        leakiest: result.leakiest.area.name,
      });
      void notifyLeak(access);
      onDone(access);
    } catch (err) {
      setError((err as Error).message || 'We could not save your result. Please try again.');
      setBusy(false);
    }
  };

  return (
    <section className="pt-4">
      <p className={EYEBROW}>All 30 answered</p>
      <h2 className="mt-3 text-[36px] font-editorial font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[48px]">Where should we send your result?</h2>
      <p className="mt-3 max-w-[560px] text-[17px] leading-[1.6] text-[var(--pg-body)]">
        Your score, band, archetype and biggest leak are ready. Add your details to see them. We email you a link to your
        result so you can come back to it.
      </p>
      <div className="mt-8 grid max-w-[760px] gap-4 sm:grid-cols-2">
        <div className="rounded-[17px] border border-[var(--pg-accent)] p-5 sm:p-6">
          <p className={EYEBROW}>Free, right now</p>
          <p className="mt-2 text-[16px] leading-[1.55]">
            Your score out of 100, your band, your archetype, your biggest leak and a first move for this week. No purchase needed.
          </p>
        </div>
        <div className="rounded-[17px] border border-[var(--pg-line)] p-5 sm:p-6">
          <p className={EYEBROW}>In the full report (paid)</p>
          <p className="mt-2 text-[16px] leading-[1.55]">
            All six pillars charted and every leak ranked, a 30-day plan for your top two, your archetype’s blind spot and your owner-dependence breakdown.
          </p>
        </div>
      </div>
      <form onSubmit={submit} noValidate className="mt-10 max-w-[560px] space-y-5">
        <div>
          <label htmlFor="lt-name" className={LABEL}>Your name</label>
          <input id="lt-name" value={form.name} onChange={set('name')} autoComplete="name" className={INPUT} />
        </div>
        <div>
          <label htmlFor="lt-email" className={LABEL}>Email</label>
          <input id="lt-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" className={INPUT} />
        </div>
        <div>
          <label htmlFor="lt-wa" className={LABEL}>WhatsApp number</label>
          <input id="lt-wa" type="tel" value={form.whatsapp} onChange={set('whatsapp')} autoComplete="tel" placeholder="+234 …" className={INPUT} />
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-[1.55] text-[var(--pg-body)]">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => {
              setForm((current) => ({ ...current, consent: e.target.checked }));
              setError(null);
            }}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--pg-accent)]"
          />
          <span>
            I agree that Breadmaker Systems (Restart Integrated Systems Ltd.) may store my answers and contact details
            and send me my result and related emails and WhatsApp messages about it. I can stop at any time by replying
            STOP. See the{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-4">
              privacy notice
            </a>
            .
          </span>
        </label>
        {error && (
          <p role="alert" className="rounded-[11px] border border-[var(--pg-accent)] px-4 py-3 text-[15px]">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <BackButton onBack={onBack} />
          <button type="submit" disabled={busy} className={BTN}>
            {busy ? 'Saving…' : 'Show my result'}
          </button>
        </div>
        <p className="text-[14px] leading-[1.6] text-[var(--pg-body)]">
          A self-assessment, not a financial or legal audit.
        </p>
      </form>
    </section>
  );
}

function ShareCard({ result }: { result: LeakResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const card = { total: result.total, band: result.band, archetype: result.archetype.name, leakiest: result.leakiest.area.name };

  useEffect(() => {
    if (canvasRef.current) drawShareCard(canvasRef.current, card);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.total, result.band, result.archetype.name, result.leakiest.area.name]);

  const download = async () => {
    if (!canvasRef.current) return;
    const blob = await canvasToBlob(canvasRef.current);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'business-leak-test-result.png';
    link.click();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    if (!canvasRef.current) return;
    const blob = await canvasToBlob(canvasRef.current);
    const file = new File([blob], 'business-leak-test-result.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText(card), url: SHARE_URL });
      } else if (navigator.share) {
        await navigator.share({ text: shareText(card), url: SHARE_URL });
      } else {
        await navigator.clipboard.writeText(`${shareText(card)} ${SHARE_URL}`);
        setNote('Copied. Paste it anywhere.');
      }
    } catch {
      /* the person closed the share sheet */
    }
  };

  return (
    <div className="mt-12 grid items-start gap-8 sm:grid-cols-[280px_1fr]">
      <canvas ref={canvasRef} className="w-full max-w-[280px] rounded-[13px] border border-[var(--pg-line)]" aria-label="Your shareable result card" />
      <div>
        <h3 className="text-[22px] font-bold">Share your result</h3>
        <p className="mt-2 max-w-[420px] text-[16px] leading-[1.6] text-[var(--pg-body)]">
          A card with your score, archetype and biggest leak. It does not include your name or your answers.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={share} className={GHOST}>Share</button>
          <button onClick={download} className={GHOST}>Download image</button>
        </div>
        {note && <p className="mt-3 text-[14px] text-[var(--pg-body)]" role="status">{note}</p>}
      </div>
    </div>
  );
}

function FreeResult({
  answers,
  access,
  paidTier,
  onUnlocked,
  onRetake,
  openPath,
  onNavigate,
}: {
  answers: number[];
  access: Access | null;
  paidTier: PaidTier | null;
  onUnlocked: (tier: PaidTier) => void;
  onRetake: () => void;
  openPath: (path: string) => void;
  onNavigate: (route: Route) => void;
}) {
  const result = scoreLeakTest(answers);
  const band = BAND_COPY[result.band];
  const reportPath = access ? `/leak-test/report?s=${access.id}&t=${access.token}` : '/leak-test/report';
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    if (!access) return;
    getLeakTest(access)
      .then((stored) => setFirstName((stored?.name ?? '').trim().split(/s+/)[0] ?? ''))
      .catch(() => setFirstName(''));
  }, [access]);

  return (
    <section className="pt-16">
      <p className={EYEBROW}>Your score</p>
      <p className="mt-3 font-editorial text-[96px] font-semibold leading-none tracking-[-0.04em] sm:text-[140px]">
        {result.total}
        <span className="text-[40px] text-[var(--pg-body)] sm:text-[56px]">/100</span>
      </p>
      <h2 className="mt-4 font-editorial text-[32px] font-semibold tracking-[-0.01em]">{band.title}</h2>
      <p className="mt-2 max-w-[640px] text-[18px] leading-[1.55] text-[var(--pg-body)]">{band.body}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[17px] bg-[var(--pg-card)] p-6 border border-[var(--pg-line-soft)] sm:p-7">
          <p className={EYEBROW}>Your archetype</p>
          <p className="mt-2 font-editorial text-[26px] font-semibold tracking-[-0.01em]">{result.archetype.name}</p>
          <p className="mt-2 text-[16px] leading-[1.55] text-[var(--pg-body)]">{result.archetype.superpower}</p>
        </div>
        <div className="rounded-[17px] border border-[var(--pg-accent)] p-6 sm:p-7">
          <p className={EYEBROW}>Your biggest leak</p>
          <p className="mt-2 font-editorial text-[26px] font-semibold tracking-[-0.01em]">{result.leakiest.area.name}</p>
          <p className="mt-2 text-[16px] leading-[1.55] text-[var(--pg-body)]">
            This is the pillar costing you the most right now.
          </p>
        </div>
      </div>

      {result.ownerDependent && (
        <p className="mt-4 rounded-[13px] border border-[var(--pg-line)] px-5 py-4 text-[16px] leading-[1.55] text-[var(--pg-body)]">
          <span className="font-semibold text-[var(--pg-ink)]">Owner dependence warning.</span> The business leans on you
          more than it should. The full report breaks down why.
        </p>
      )}

      <NextStep result={result} openPath={openPath} />

      <ShareCard result={result} />

      {paidTier ? (
        <div className="mt-14 rounded-[17px] border border-[var(--pg-accent)] p-7 sm:p-9">
          <p className={EYEBROW}>Your full report is unlocked</p>
          <p className="mt-3 text-[20px] leading-[1.5]">
            Six-pillar chart, every leak ranked, a 30-day plan for your top two and how to cover your blind spot.
          </p>
          <button onClick={() => openPath(reportPath)} className={`${BTN} mt-6`}>
            Open my report
          </button>
        </div>
      ) : (
        <Paywall
          access={access}
          firstName={firstName}
          result={result}
          onUnlocked={(tier) => {
            onUnlocked(tier);
            openPath(reportPath);
          }}
          onNavigate={onNavigate}
        />
      )}

      <div className="mt-14 flex flex-wrap gap-4">
        <button onClick={onRetake} className={GHOST}>
          Retake the test
        </button>
      </div>
      <p className="mt-6 max-w-[560px] text-[14px] leading-[1.6] text-[var(--pg-body)]">
        This is a self-assessment, not a financial or legal audit. Your result is saved so you can come back to it, and
        we have emailed you a link.
      </p>
    </section>
  );
}

/** Turns the free result into a plan: one action for this week, then the way to fix the leak properly. */
function NextStep({ result, openPath }: { result: LeakResult; openPath: (path: string) => void }) {
  const area = result.leakiest.area;
  const system = systemForPillar(area.id);
  const program = system ? programForSystem(system.id) : undefined;
  const agent = agentForPillar(area.id);
  const [liveLine, setLiveLine] = useState<string | null>(null);
  const [kit, setKit] = useState<KitOffer | null>(null);

  useEffect(() => {
    if (!system) return;
    listKitOffers()
      .then((offers) => setKit(offers.find((offer) => offer.systemId === system.id) ?? null))
      .catch(() => setKit(null));
  }, [system?.id]);

  // Live numbers only for the agent Restart runs today; anything else keeps its plain statement.
  useEffect(() => {
    liveAgentLine(area.id).then(setLiveLine).catch(() => setLiveLine(null));
  }, [area.id]);

  return (
    <div className="mt-10 rounded-[17px] bg-[var(--pg-card)] p-6 border border-[var(--pg-line-soft)] sm:p-8">
      <p className={EYEBROW}>Start here</p>
      <h3 className="mt-2 font-editorial text-[26px] font-semibold tracking-[-0.01em]">Your first move this week</h3>
      <p className="mt-3 max-w-[680px] text-[18px] leading-[1.55]">{area.firstFix}</p>
      <p className="mt-2 text-[15px] text-[var(--pg-body)]">Done when it is written down and live where your customers will see it.</p>

      {system && (
        <div className="mt-8 border-t border-[var(--pg-line-soft)] pt-6">
          <p className={EYEBROW}>To fix it properly</p>
          <p className="mt-2 text-[18px] font-bold">{system.name}</p>
          <p className="mt-1 max-w-[680px] text-[16px] leading-[1.55] text-[var(--pg-body)]">{system.goal}.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {kit && (
              <button onClick={() => openPath(coursePath(kit.slug))} className={BTN}>
                See the {system.name.toLowerCase()} kit
              </button>
            )}
            {program?.route && (
              <button onClick={() => openPath(`/${program.route}`)} className={kit ? GHOST : BTN}>
                Build it with {program.name.replace('Breadmaker ', '')}
              </button>
            )}
          </div>
          {!kit && (
            <p className="mt-3 max-w-[560px] text-[14px] leading-[1.6] text-[var(--pg-body)]">
              {system.name} is not on sale as a single kit yet. The program above builds it with you.
            </p>
          )}
        </div>
      )}

      {agent && (
        <div className="mt-8 border-t border-[var(--pg-line-soft)] pt-6">
          <p className={EYEBROW}>An agent that works on this leak</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-[18px] font-bold">{agent.name}</p>
            <span className="rounded-full bg-[var(--pg-alt)] px-2.5 py-1 text-[12px] font-medium">{PROOF_LABEL[agent.proof === 'built' && liveLine ? 'restart' : agent.proof]}</span>
          </div>
          <p className="mt-1 max-w-[680px] text-[16px] leading-[1.55] text-[var(--pg-body)]">{agent.job}</p>
          <p className="mt-2 max-w-[680px] text-[14px] leading-[1.6] text-[var(--pg-body)]">{agent.evidence}</p>
          {liveLine && <p className="mt-2 max-w-[680px] text-[14px] font-medium leading-[1.6]">{liveLine}</p>}
        </div>
      )}
    </div>
  );
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** A teaser of the report. The bars are decorative and blurred; the real content stays on the server. */
function LockedPreview({ result }: { result: LeakResult }) {
  const widths = [86, 64, 52, 41, 30];
  return (
    <div className="mt-6 rounded-[13px] bg-[var(--pg-card)] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[16px] font-bold">1. {result.leakiest.area.name}</p>
        <span className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Biggest leak</span>
      </div>
      <div className="relative mt-4">
        <div aria-hidden className="space-y-3 select-none blur-[5px]">
          {widths.map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 text-[14px]">{i + 2}.</span>
              <div className="h-3 flex-1 rounded-full bg-[var(--pg-line)]">
                <div className="h-3 rounded-full bg-[var(--pg-accent)]" style={{ width: `${w}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="absolute inset-0 flex items-center justify-center text-center text-[15px] font-semibold">
          Leaks 2 to 6, your 30-day plan and your blind spot are in the full report
        </p>
      </div>
    </div>
  );
}

const INCLUDED = [
  'A chart of all six pillars',
  'Every leak ranked, in plain language',
  'A 30-day fix plan for your top two leaks, 4 actions each',
  'Your archetype’s blind spot and how to cover it',
  'Your owner-dependence breakdown',
  'A comparison with businesses like yours, as data builds up',
];

function Paywall({
  access,
  firstName,
  result,
  onUnlocked,
  onNavigate,
}: {
  access: Access | null;
  firstName: string;
  result: LeakResult;
  onUnlocked: (tier: PaidTier) => void;
  onNavigate: (route: Route) => void;
}) {
  const { text: priceText, resolve: resolveAmount } = usePrice();
  const [prices, setPrices] = useState<ReportPrice[]>([]);
  const [offers, setOffers] = useState<ReportOffer[]>([]);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listReportPrices().then(setPrices).catch(() => setPrices([]));
  }, []);

  // Open offers for this result. The deadline comes from the server; the browser clock is only
  // used to count down from the server's "now", so a wrong device clock cannot change it.
  useEffect(() => {
    if (!access) return;
    getReportOffers(access)
      .then((found) => {
        setOffers(found);
        if (found.length === 0) return;
        const skew = Date.now() - new Date(found[0].server_now).getTime();
        const ends = new Date(found[0].ends_at).getTime() + skew;
        setMsLeft(ends - Date.now());
        const timer = window.setInterval(() => {
          const left = ends - Date.now();
          setMsLeft(left);
          if (left <= 0) window.clearInterval(timer);
        }, 1000);
        timers.current = timer;
      })
      .catch(() => setOffers([]));
    return () => window.clearInterval(timers.current);
  }, [access]);

  const timers = useRef(0);
  const offerLive = offers.length > 0 && msLeft !== null && msLeft > 0;

  const pay = async (tier: PaidTier) => {
    if (!access) return;
    setBusy(tier);
    setError(null);
    try {
      window.location.assign(await startReportCheckout(access, tier));
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const redeem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!access || !code.trim()) return;
    setBusy('code');
    setError(null);
    try {
      const tier = await redeemCode(access, code.trim());
      void notifyLeak(access, 'paid');
      onUnlocked(tier);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="mt-14 rounded-[17px] border border-[var(--pg-line)] p-7 sm:p-9">
      {offerLive && msLeft !== null && (
        <div role="timer" className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-[11px] bg-[var(--pg-accent)] px-5 py-3.5 text-white">
          <p className="text-[15px] font-semibold">
            {offers[0].discount_pct}% off your report, for people who just took the test
          </p>
          <p className="font-label text-[20px] font-semibold tabular-nums">{formatCountdown(msLeft)}</p>
        </div>
      )}
      <p className={EYEBROW}>The full report</p>
      <h3 className="mt-3 font-editorial text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] sm:text-[36px]">
        {firstName ? `${firstName}, your ` : 'Your '}
        {result.leakiest.area.name} leak is costing you most. Here is how to fix it.
      </h3>
      <LockedPreview result={result} />
      <ul className="mt-6 space-y-3">
        {INCLUDED.map((item) => (
          <li key={item} className="flex gap-3 text-[17px] leading-[1.5]">
            <Check className="mt-1 h-5 w-5 shrink-0 text-[var(--pg-accent)]" aria-hidden />
            {item}
          </li>
        ))}
      </ul>

      {prices.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {prices.map((price) => (
            <div key={price.tier} className="flex flex-col rounded-[13px] border border-[var(--pg-line)] p-6">
              <p className="text-[18px] font-bold">{price.label}</p>
              <p className="mt-1 text-[15px] leading-[1.5] text-[var(--pg-body)]">{price.description}</p>
              {(() => {
                const offer = offerLive ? offers.find((o) => o.tier === price.tier) : undefined;
                const shown = resolveAmount({ priceMinor: price.price_minor, currency: price.currency, altPriceMinor: price.alt_price_minor });
                const shownMinor = shown.priceMinor ?? 0;
                if (!offer) {
                  return (
                    <p className="mt-4 font-editorial text-[32px] font-semibold tracking-[-0.01em]">{money(shownMinor, shown.currency)}</p>
                  );
                }
                const now = Math.round((shownMinor * (100 - offer.discount_pct)) / 100);
                return (
                  <p className="mt-4 flex flex-wrap items-baseline gap-x-3">
                    <span className="font-editorial text-[32px] font-semibold tracking-[-0.01em]">{money(now, shown.currency)}</span>
                    <span className="text-[18px] text-[var(--pg-body)] line-through">{money(shownMinor, shown.currency)}</span>
                    <span className="font-label text-[13px] font-semibold text-[var(--pg-accent)]">{offer.discount_pct}% off</span>
                  </p>
                );
              })()}
              {paymentsEnabled ? (
                <button onClick={() => pay(price.tier)} disabled={!!busy} className={`${BTN} mt-5 !px-6 !py-4 !text-[16px]`}>
                  {busy === price.tier ? 'Opening checkout…' : 'Unlock'}
                </button>
              ) : (
                <p className="mt-5 text-[14px] text-[var(--pg-body)]">Online payment opens soon. Have a code? Use it below.</p>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={redeem} className="mt-8 flex max-w-[480px] flex-col gap-3 sm:flex-row">
        <label htmlFor="lt-code" className="sr-only">Access code</label>
        <input
          id="lt-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="Have a code? BM-XXXXXXXX"
          className={INPUT}
        />
        <button type="submit" disabled={!code.trim() || !!busy} className={`${GHOST} shrink-0`}>
          {busy === 'code' ? 'Checking…' : 'Use code'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-4 rounded-[11px] border border-[var(--pg-accent)] px-4 py-3 text-[15px]">
          {error}
        </p>
      )}

      <p className="mt-6 text-[14px] leading-[1.6] text-[var(--pg-body)]">
        Accountant, incubator, bank or cooperative? We sell codes for your clients at a discount.{' '}
        <button onClick={() => onNavigate('contact')} className="underline underline-offset-4 cursor-pointer">
          Get in touch
        </button>
        .
      </p>
    </div>
  );
}
