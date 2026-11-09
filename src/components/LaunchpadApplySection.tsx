import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Route } from '../types';
import { OpenCohort, joinWaitlist, loadOpenCohorts, loadProgramStatus, submitApplication } from '../lib/programs';
import { platformOf } from '../lib/program-questions';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/lms';
import { trackEvent } from '../lib/metrics';
import LaunchpadWizard from './LaunchpadWizard';
import { PlatformIcon } from './PlatformIcons';
import { Button } from './lms/lms-ui';
import { H2, Label, Section } from './program-ui';

/**
 * The Launchpad build-spot form, as a section of the landing page (#apply).
 * It owns the answers and the submit; LaunchpadWizard walks the applicant through the four steps.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const TIER = 'done-with-you';

const INTRO_POINTS = [
  'Four short steps, about two minutes',
  'Pick Shopify, WordPress or custom',
  'Tell us what you sell',
  'We draft your funnel brief for you to review before you pay',
];

const INCLUDES = [
  'A live funnel in 7 days',
  'One clear step to do each day',
  'Built on Shopify, WordPress or your own stack',
];

interface LaunchpadApplySectionProps {
  onNavigate: (route: Route) => void;
  /** A platform chosen elsewhere on the page (a platform card, or ?platform= in the address). */
  platform?: string;
}

export default function LaunchpadApplySection({ onNavigate, platform }: LaunchpadApplySectionProps) {
  const { user: signedIn } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [cohortId, setCohortId] = useState('');
  const [cohorts, setCohorts] = useState<OpenCohort[] | null>(null);
  const [cohortsFailed, setCohortsFailed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'waitlisted'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Launch measurement: this visitor reached the form. Counted once per visitor per day.
  useEffect(() => {
    trackEvent('launchpad_apply_start');
  }, []);

  // A signed-in member does not retype who they are: their name and email are filled in (and can still be changed).
  useEffect(() => {
    if (!signedIn) return;
    const meta = signedIn.user_metadata ?? {};
    const name = String(meta.full_name ?? meta.name ?? [meta.first_name, meta.last_name].filter(Boolean).join(' ') ?? '').trim();
    setForm((current) => ({ ...current, name: current.name || name, email: current.email || signedIn.email || '' }));
  }, [signedIn?.id]);

  // A platform picked on the landing page is already chosen here.
  const preselected = platformOf(platform ?? '');
  useEffect(() => {
    if (preselected) setAnswers((current) => ({ ...current, platform: preselected.id }));
  }, [preselected?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [open] = await Promise.all([loadOpenCohorts('launchpad'), loadProgramStatus('launchpad')]);
        if (cancelled) return;
        setCohorts(open);
        setCohortId(open[0]?.id ?? '');
      } catch {
        if (!cancelled) {
          setCohorts([]);
          setCohortsFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAnswer = (id: string, value: string) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setError(null);
  };

  const submit = async () => {
    if (!form.name.trim()) return setError('Please add your name.');
    if (!EMAIL_PATTERN.test(form.email.trim())) return setError('Please add a valid email address.');
    setStatus('sending');
    try {
      await submitApplication({
        program: 'launchpad',
        tier: TIER,
        cohortId: cohortId || null,
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        answers,
      });
      setStatus('sent');
      document.getElementById('apply')?.scrollIntoView({ block: 'start' });
    } catch (err) {
      setStatus('idle');
      const message = errorMessage(err);
      // The queue lives in the database; if it is not reachable, do not leave the applicant with a dead end.
      const unreachable = /submit_application|does not exist|schema cache|Failed to fetch/i.test(message);
      setError(unreachable ? 'We could not file your application just now. Please use the contact form and we will pick it up by hand.' : message);
      setUnavailable(unreachable);
    }
  };

  const waitlist = async () => {
    if (!form.name.trim() || !EMAIL_PATTERN.test(form.email.trim())) {
      setError('Please add your name and a valid email so we can reach you.');
      return;
    }
    setStatus('sending');
    try {
      await joinWaitlist({ program: 'launchpad', cohortId: cohortId || null, name: form.name, email: form.email, phone: form.phone, note: TIER });
      setStatus('waitlisted');
    } catch (err) {
      setStatus('idle');
      setError(errorMessage(err));
    }
  };

  const chosen = platformOf(answers.platform);
  const nextSteps = [
    'We open your Breadmaker Hub account and draft your funnel brief. Check your email in a few minutes.',
    `Read the brief: the one problem and the one customer your ${chosen?.title ?? 'funnel'} funnel is built around. Ask for changes if it is off.`,
    'Choose your web address, then approve the brief and pay. That confirms it and starts your build.',
    'Your preview is built automatically within minutes. We review it before it goes live.',
  ];
  const noRoom = !cohortsFailed && cohorts !== null && cohorts.length === 0;

  return (
    <Section id="apply" tone="white" pad="wide">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_620px] lg:gap-20">
        <div className="lg:pt-10">
          <Label>Reserve your build spot</Label>
          <H2 className="mt-7 max-w-[560px]">We build the hard parts with you.</H2>
          <ul className="mt-6 max-w-[520px] space-y-3 text-[18px] leading-[1.5] text-[var(--pg-body)]">
            {INTRO_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <Check className="mt-1.5 h-[18px] w-[18px] shrink-0 text-[var(--pg-accent)]" strokeWidth={2.75} />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-10 max-w-[520px] rounded-[14px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-6">
            <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">What you get</p>
            <ul className="mt-4 space-y-2.5 text-[15.5px] leading-[1.5]">
              {INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--pg-accent)]" /> {item}
                </li>
              ))}
            </ul>
            {chosen && (
              <p className="mt-4 flex items-center gap-2 border-t border-[var(--pg-line-soft)] pt-4 text-[14px] text-[var(--pg-body)]">
                <PlatformIcon id={chosen.id} className="h-4 w-4 text-[var(--pg-ink)]" />
                Building on {chosen.title}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[11px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-7 sm:p-10">
          {status === 'sent' || status === 'waitlisted' ? (
            <div className="py-6" role="status">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]">
                <Check className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-editorial text-[30px] font-semibold leading-[1.15]">
                {status === 'waitlisted' ? 'You are on the waitlist.' : 'We are drafting your funnel brief.'}
              </h3>
              <p className="mt-3 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                {status === 'waitlisted'
                  ? `We will email ${form.email.trim()} the moment a place opens up.`
                  : `Check ${form.email.trim()} for your brief link. It usually arrives within a few minutes, and we open your Breadmaker Hub account at the same time.`}
              </p>
              {status === 'sent' && (
                <ol className="mt-6 space-y-3 text-[15.5px] leading-[1.55]">
                  {nextSteps.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="font-label text-[12.5px] text-[var(--pg-accent)]">{String(index + 1).padStart(2, '0')}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-8">
                <Button onClick={() => onNavigate('home')}>Back to homepage</Button>
              </div>
            </div>
          ) : (
            <LaunchpadWizard
              key={preselected?.id ?? 'none'}
              form={form}
              setField={(field, value) => {
                setForm((current) => ({ ...current, [field]: value }));
                setError(null);
              }}
              answers={answers}
              setAnswer={setAnswer}
              sending={status === 'sending'}
              error={error}
              setError={setError}
              onSubmit={() => void submit()}
              initialStep={preselected ? 1 : 0}
              footer={
                <>
                  {unavailable && (
                    <Button type="button" variant="ghost" className="w-full" onClick={() => onNavigate('contact')}>
                      Use the contact form
                    </Button>
                  )}
                  {noRoom && (
                    <Button type="button" variant="ghost" className="w-full" onClick={waitlist} busy={status === 'sending'}>
                      Join the waitlist instead
                    </Button>
                  )}
                </>
              }
            />
          )}
        </div>
      </div>
    </Section>
  );
}
