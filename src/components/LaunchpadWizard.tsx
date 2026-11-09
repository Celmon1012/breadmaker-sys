import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { FUNNEL_PLATFORMS, QUESTIONS, platformOf } from '../lib/program-questions';
import { Button, Field, Notice, TextArea, TextInput } from './lms/lms-ui';
import { PlatformIcon, PlatformId, PlatformTile } from './PlatformIcons';

/**
 * The Launchpad build-spot form as four short steps: where the funnel lives, what you sell,
 * the details we need, and how to reach you. The apply section owns the answers and the submit;
 * this component only walks the applicant through them.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const STEPS = [
  { label: 'Platform', title: 'Where should your funnel live?', blurb: 'Pick one. You can change your mind on the call.' },
  { label: 'Your offer', title: 'What are we helping you sell?', blurb: 'A few plain words is plenty.' },
  { label: 'Details', title: 'A few more details for your funnel.', blurb: 'Nothing technical. Not sure is a fine answer.' },
  { label: 'You', title: 'Last step: how do we reach you?', blurb: 'We email you a time for your start call.' },
] as const;

const optionsFor = (id: string) => QUESTIONS.launchpad.find((question) => question.id === id)?.options ?? [];

export interface WizardForm {
  name: string;
  email: string;
  phone: string;
  company: string;
}

interface LaunchpadWizardProps {
  form: WizardForm;
  setField: (field: keyof WizardForm, value: string) => void;
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  sending: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  onSubmit: () => void;
  /** Extra actions under the buttons (contact-form fallback, waitlist). */
  footer?: React.ReactNode;
  initialStep?: number;
}

export function Chips({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13.5px] font-medium text-[var(--pg-ink)]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[14.5px] transition-colors cursor-pointer ${
                selected
                  ? 'border-[var(--pg-accent)] bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]'
                  : 'border-[var(--pg-line)] hover:bg-[var(--pg-alt)]'
              }`}
            >
              {selected && <Check className="h-3.5 w-3.5" />}
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function LaunchpadWizard({ form, setField, answers, setAnswer, sending, error, setError, onSubmit, footer, initialStep = 0 }: LaunchpadWizardProps) {
  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState(1);
  const reduceMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<number>(undefined);
  const mounted = useRef(false);

  const platform = platformOf(answers.platform);
  const last = step === STEPS.length - 1;

  useEffect(() => {
    if (mounted.current) headingRef.current?.focus({ preventScroll: true });
    mounted.current = true;
  }, [step]);

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const problemWith = (index: number): string | null => {
    if (index === 0 && !answers.platform) return 'Pick Shopify, WordPress or Custom to continue.';
    if (index === 1) {
      if (!(answers.business ?? '').trim()) return 'Tell us what you sell, in a sentence or two.';
      if (!answers.action) return 'Choose what visitors should do on your page.';
    }
    if (index === 2 && !answers.domain) return 'Let us know if you already have a domain. Not sure is fine.';
    if (index === 3) {
      if (!form.name.trim()) return 'Please add your name.';
      if (!EMAIL_PATTERN.test(form.email.trim())) return 'Please add a valid email address.';
    }
    return null;
  };

  const go = (target: number) => {
    window.clearTimeout(advanceTimer.current);
    setDirection(target > step ? 1 : -1);
    setError(null);
    setStep(target);
  };

  const next = () => {
    const problem = problemWith(step);
    if (problem) {
      setError(problem);
      return;
    }
    if (last) onSubmit();
    else go(step + 1);
  };

  const choosePlatform = (id: string) => {
    setAnswer('platform', id);
    // A short beat so the choice registers, then on to the next step.
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      setDirection(1);
      setError(null);
      setStep((current) => (current === 0 ? 1 : current));
    }, reduceMotion ? 0 : 320);
  };

  const slide = reduceMotion ? 0 : 28;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        next();
      }}
    >
      <div aria-label={`Step ${step + 1} of ${STEPS.length}`} role="group">
        <div className="flex items-center justify-between text-[12.5px] font-medium uppercase tracking-[0.06em] text-[var(--pg-body)]">
          <span className="font-label">Step {step + 1} of {STEPS.length}</span>
          <span className="font-label text-[var(--pg-accent)]">{STEPS[step].label}</span>
        </div>
        <div className="mt-2 flex gap-1.5" aria-hidden="true">
          {STEPS.map((item, index) => (
            <span
              key={item.label}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${index <= step ? 'bg-[var(--pg-accent)]' : 'bg-[var(--pg-line-soft)]'}`}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: direction * slide }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -direction * slide }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="pt-7"
        >
          <h2 ref={headingRef} tabIndex={-1} className="font-editorial text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] outline-none sm:text-[32px]">
            {STEPS[step].title}
          </h2>
          <p className="mt-2 text-[15.5px] leading-[1.55] text-[var(--pg-body)]">{STEPS[step].blurb}</p>

          <div className="mt-6 space-y-6">
            {step === 0 && (
              <div role="radiogroup" aria-label="Funnel platform" className="grid gap-3">
                {FUNNEL_PLATFORMS.map((option) => {
                  const selected = answers.platform === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => choosePlatform(option.id)}
                      className={`group flex items-center gap-4 rounded-[14px] border p-4 text-left transition-all cursor-pointer active:scale-[0.99] ${
                        selected
                          ? 'border-[var(--pg-accent)] bg-[var(--pg-alt)] ring-1 ring-[var(--pg-accent)]'
                          : 'border-[var(--pg-line)] hover:-translate-y-px hover:bg-[var(--pg-alt)]'
                      }`}
                    >
                      <PlatformTile id={option.id as PlatformId} selected={selected} size="lg" />
                      <span className="flex-1">
                        <span className="block font-editorial text-[20px] font-semibold leading-tight">{option.title}</span>
                        <span className="mt-0.5 block text-[14px] leading-[1.45] text-[var(--pg-body)]">{option.body}</span>
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          selected ? 'border-[var(--pg-accent)] bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]' : 'border-[var(--pg-line)]'
                        }`}
                        aria-hidden="true"
                      >
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <>
                <Field label="What do you sell?" hint="The offer, who it is for, and how people hear about you today.">
                  <TextArea rows={4} value={answers.business ?? ''} onChange={(event) => setAnswer('business', event.target.value)} autoFocus />
                </Field>
                <Chips label="What should visitors do on your page?" value={answers.action ?? ''} options={optionsFor('action')} onChange={(value) => setAnswer('action', value)} />
                <div>
                  <Chips label="What kind of funnel?" value={answers.format ?? 'Enquiry page'} options={optionsFor('format')} onChange={(value) => setAnswer('format', value)} />
                  {(answers.format ?? '') === 'Scorecard quiz' && (
                    <p className="mt-2 text-[14px] leading-[1.55] text-[var(--pg-body)]">Visitors answer a few questions, leave their details and see a result. You see who is ready now, who needs a nudge and who is early.</p>
                  )}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <Chips
                  label="Do you already have a domain name?"
                  value={answers.domain ?? ''}
                  options={optionsFor('domain')}
                  onChange={(value) => {
                    setAnswer('domain', value);
                    if (value !== 'Yes') setAnswer('domain_url', '');
                  }}
                />
                {answers.domain === 'Yes' && (
                  <Field label="Your domain" hint="Optional. For example yourdomain.com.">
                    <TextInput value={answers.domain_url ?? ''} onChange={(event) => setAnswer('domain_url', event.target.value)} placeholder="yourdomain.com" inputMode="url" autoComplete="url" autoFocus />
                  </Field>
                )}
                <Field label="What should we build for you?" hint="Optional. The page, the booking or payment step, the follow-up messages.">
                  <TextArea rows={3} value={answers.needs_built ?? ''} onChange={(event) => setAnswer('needs_built', event.target.value)} />
                </Field>
                <Field label="Anything else we should know?" hint="Optional.">
                  <TextArea rows={2} value={answers.anything ?? ''} onChange={(event) => setAnswer('anything', event.target.value)} />
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  {platform && (
                    <span className="inline-flex items-center gap-2 rounded-full bg-[var(--pg-alt)] py-1.5 pl-2.5 pr-3.5 font-medium">
                      <PlatformIcon id={platform.id} className="h-4 w-4" /> {platform.title}
                    </span>
                  )}
                  {answers.action && <span className="rounded-full bg-[var(--pg-alt)] px-3.5 py-1.5 font-medium">{answers.action}</span>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your name">
                    <TextInput value={form.name} onChange={(event) => setField('name', event.target.value)} autoComplete="name" autoFocus />
                  </Field>
                  <Field label="Email">
                    <TextInput type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} autoComplete="email" />
                  </Field>
                  <Field label="Phone or WhatsApp (optional)">
                    <TextInput value={form.phone} onChange={(event) => setField('phone', event.target.value)} autoComplete="tel" />
                  </Field>
                  <Field label="Business or website (optional)">
                    <TextInput value={form.company} onChange={(event) => setField('company', event.target.value)} autoComplete="organization" />
                  </Field>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {error && (
        <div className="mt-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mt-7 flex items-center gap-3">
        {step > 0 && (
          <Button type="button" variant="ghost" onClick={() => go(step - 1)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        )}
        <Button type="submit" busy={sending} className="ml-auto px-7 py-3">
          {last ? 'Reserve my build spot' : 'Continue'}
          {!last && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>

      {last && footer && <div className="mt-3 flex flex-col gap-3">{footer}</div>}

      {last && <p className="mt-5 text-[13px] leading-[1.5] text-[var(--pg-body)]">We use your answers to decide who we can help, and nothing else. No newsletter, no list.</p>}
    </form>
  );
}
