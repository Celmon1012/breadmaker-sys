import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { AcademyIncludes } from './lms/AcademyMembership';
import { Route } from '../types';
import { PROGRAM_NAME, TIER_LABEL } from '../lib/program-config';
import { usePrice } from '../lib/use-price';
import { OpenCohort, TierPrice, joinWaitlist, loadOpenCohorts, loadProgramStatus, loadTierPrices, submitApplication } from '../lib/programs';
import { money, paymentsEnabled, startCheckout } from '../lib/payments';
import { questionsFor } from '../lib/program-questions';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/lms';
import { trackEvent } from '../lib/metrics';
import FoundryWizard from './FoundryWizard';
import { Button, Notice } from './lms/lms-ui';
import { H2, Label, Section } from './program-ui';

/**
 * The Foundry application, as a section of the landing page (#apply). It owns the answers and the submit;
 * FoundryWizard walks the applicant through the four steps, and the questions come from QUESTIONS.foundry.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export default function FoundryApplySection({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const { resolve: resolveAmount } = usePrice();
  // Done-with-you is the only level, so an application with no ?tier still ends in its payment step.
  const tier = (new URLSearchParams(window.location.search).get('tier') ?? '').trim() || 'done-with-you';
  const questions = useMemo(() => questionsFor('foundry', tier), [tier]);

  // Launch measurement: this visitor reached the form. Counted once per visitor per day.
  useEffect(() => {
    trackEvent('foundry_apply_start');
  }, []);

  const { user: signedIn } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '' });
  // A signed-in member does not retype who they are: their name and email are filled in (and can still be changed).
  useEffect(() => {
    if (!signedIn) return;
    const meta = signedIn.user_metadata ?? {};
    const name = String(meta.full_name ?? meta.name ?? [meta.first_name, meta.last_name].filter(Boolean).join(' ') ?? '').trim();
    setForm((current) => ({ ...current, name: current.name || name, email: current.email || signedIn.email || '' }));
  }, [signedIn?.id]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [cohortId, setCohortId] = useState('');
  const [cohorts, setCohorts] = useState<OpenCohort[] | null>(null);
  const [cohortsFailed, setCohortsFailed] = useState(false);
  const [capacity, setCapacity] = useState<{ remaining: number | null; waitlist: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'waitlisted'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [tierPrice, setTierPrice] = useState<TierPrice | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [open, state] = await Promise.all([loadOpenCohorts('foundry'), loadProgramStatus('foundry')]);
        if (cancelled) return;
        setCohorts(open);
        setCapacity({ remaining: state.remaining, waitlist: state.waitlistCount });
        setCohortId(open[0]?.id ?? '');
        if (paymentsEnabled && tier) {
          const prices = await loadTierPrices().catch(() => [] as TierPrice[]);
          if (!cancelled) setTierPrice(prices.find((price) => price.program === 'foundry' && price.tier === tier) ?? null);
        }
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

  const validate = () => {
    if (!form.name.trim()) return 'Please add your name.';
    if (!EMAIL_PATTERN.test(form.email.trim())) return 'Please add a valid email address.';
    if (questions.some((question) => question.required && !(answers[question.id] ?? '').trim())) return 'Please answer the questions marked with an asterisk.';
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setStatus('sending');
    try {
      const id = await submitApplication({
        program: 'foundry',
        tier,
        cohortId: cohortId || null,
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        answers,
      });
      setApplicationId(id);
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

  const pay = async () => {
    if (!tierPrice) return;
    setPaying(true);
    setPayError(null);
    try {
      const result = await startCheckout({
        program: 'foundry',
        tier: tierPrice.tier,
        name: form.name,
        email: form.email,
        phone: form.phone,
        applicationId,
        redirectPath: '/payment/callback',
      });
      window.location.assign(result.link);
    } catch (err) {
      setPaying(false);
      setPayError(errorMessage(err));
    }
  };

  const waitlist = async () => {
    if (!form.name.trim() || !EMAIL_PATTERN.test(form.email.trim())) {
      setError('Please add your name and a valid email so we can reach you.');
      return;
    }
    setStatus('sending');
    try {
      await joinWaitlist({ program: 'foundry', cohortId: cohortId || null, name: form.name, email: form.email, phone: form.phone, note: tier });
      setStatus('waitlisted');
    } catch (err) {
      setStatus('idle');
      setError(errorMessage(err));
    }
  };

  const nextSteps = ['We read your answers and look at anything you linked.', 'We reply with a yes, a not-yet, or a question.', 'Accepted applicants get a start date, an invoice and access to the Academy.'];
  const noRoom = !cohortsFailed && cohorts !== null && cohorts.length === 0;
  const showWaitlistCount = !!capacity && capacity.waitlist > 0;
  const shown = tierPrice ? resolveAmount(tierPrice) : null;
  const priceLabel = shown ? money(shown.priceMinor ?? 0, shown.currency) : '';

  return (
    <Section id="apply" tone="white" pad="wide">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_620px] lg:gap-20">
        <div className="lg:pt-10">
          <Label>{`${TIER_LABEL[tier] ?? tier} · ${PROGRAM_NAME.foundry}`}</Label>
          <H2 className="mt-7 max-w-[560px]">Apply for the next cohort.</H2>
          <p className="mt-6 max-w-[520px] text-[18px] leading-[1.6] text-[var(--pg-body)]">
            Thirty days, one working system, and a coach telling you exactly what to do each week. Answer a few questions and we will read it properly.
          </p>
          <div className="mt-10 max-w-[520px]">
            <AcademyIncludes />
          </div>
        </div>

        <div className="rounded-[11px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-7 sm:p-10">
          {status === 'sent' || status === 'waitlisted' ? (
            <div className="py-6" role="status">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]">
                <Check className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-editorial text-[30px] font-semibold leading-[1.15]">
                {status === 'waitlisted' ? 'You are on the waitlist.' : 'Your application is in.'}
              </h3>
              <p className="mt-3 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                {status === 'waitlisted' ? `We will email ${form.email.trim()} the moment a place opens up.` : `We have it, and we will be in touch at ${form.email.trim()}.`}
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
              {status === 'sent' && tierPrice && (
                <div className="mt-8 rounded-[14px] border border-[var(--pg-line)] p-6">
                  <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Next step</p>
                  <p className="mt-2 text-[16px] leading-[1.55]">
                    Pay {priceLabel} to hold your place on {TIER_LABEL[tierPrice.tier] ?? tierPrice.tier}. Card, bank transfer and USSD all work.
                  </p>
                  <Button className="mt-4" busy={paying} onClick={() => void pay()}>
                    Pay {priceLabel}
                  </Button>
                  {payError && (
                    <div className="mt-4">
                      <Notice tone="error">{payError}</Notice>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-8">
                <Button onClick={() => onNavigate('home')}>Back to homepage</Button>
              </div>
            </div>
          ) : (
            <FoundryWizard
              form={form}
              setField={(field, value) => {
                setForm((current) => ({ ...current, [field]: value }));
                setError(null);
              }}
              answers={answers}
              setAnswer={setAnswer}
              questions={questions}
              cohorts={cohorts}
              cohortId={cohortId}
              setCohortId={setCohortId}
              sending={status === 'sending'}
              error={error}
              setError={setError}
              onSubmit={() => void submit()}
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
                  {showWaitlistCount && capacity && (
                    <p className="text-[13.5px] text-[var(--pg-body)]">
                      {capacity.waitlist} {capacity.waitlist === 1 ? 'person is' : 'people are'} on the waitlist for this program.
                    </p>
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
