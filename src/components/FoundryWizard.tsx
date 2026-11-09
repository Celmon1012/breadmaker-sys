import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Question } from '../lib/program-questions';
import { OpenCohort } from '../lib/programs';
import { formatProgramDate } from '../lib/program-config';
import { Button, Field, Notice, TextArea, TextInput } from './lms/lms-ui';
import { Chips, WizardForm } from './LaunchpadWizard';

/**
 * The Foundry application as four short steps, the same way the Launchpad build-spot form works: your business,
 * your goal, a few details, and how to reach you. The apply section owns the answers and the submit; the questions
 * themselves come from QUESTIONS.foundry, so the wording lives in one place and this only walks the applicant
 * through them.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const STEPS = [
  { label: 'Your business', title: 'Tell us about your business.', blurb: 'A few plain words is plenty.', fields: ['business'] },
  { label: 'Your goal', title: 'Where do you want to get to?', blurb: 'One number is enough. We build the 30 days around it.', fields: ['outcome', 'built'] },
  { label: 'Details', title: 'A few more details for your build.', blurb: 'Nothing technical. Not sure is a fine answer.', fields: ['terminal', 'needs_built', 'anything'] },
  { label: 'You', title: 'Last step: how do we reach you?', blurb: 'We read your answers and reply with a yes, a not-yet, or a question.', fields: [] },
] as const;

interface FoundryWizardProps {
  form: WizardForm;
  setField: (field: keyof WizardForm, value: string) => void;
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  /** The questions asked for the chosen tier (QUESTIONS.foundry, filtered). */
  questions: Question[];
  cohorts: OpenCohort[] | null;
  cohortId: string;
  setCohortId: (id: string) => void;
  sending: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  onSubmit: () => void;
  /** Extra actions under the buttons (contact-form fallback, waitlist). */
  footer?: React.ReactNode;
}

export default function FoundryWizard({ form, setField, answers, setAnswer, questions, cohorts, cohortId, setCohortId, sending, error, setError, onSubmit, footer }: FoundryWizardProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const reduceMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  const last = step === STEPS.length - 1;
  const question = (id: string) => questions.find((item) => item.id === id);

  useEffect(() => {
    if (mounted.current) headingRef.current?.focus({ preventScroll: true });
    mounted.current = true;
  }, [step]);

  const problemWith = (index: number): string | null => {
    for (const id of STEPS[index].fields) {
      const item = question(id);
      if (item?.required && !(answers[id] ?? '').trim()) return item.kind === 'select' ? 'Choose one to continue.' : 'Please answer this one to continue.';
    }
    if (index === STEPS.length - 1) {
      if (!form.name.trim()) return 'Please add your name.';
      if (!EMAIL_PATTERN.test(form.email.trim())) return 'Please add a valid email address.';
    }
    return null;
  };

  const go = (target: number) => {
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

  const field = (id: string, first: boolean) => {
    const item = question(id);
    if (!item) return null;
    if (item.kind === 'select') {
      return (
        <div key={id}>
          <Chips label={item.label} value={answers[id] ?? ''} options={item.options ?? []} onChange={(value) => setAnswer(id, value)} />
        </div>
      );
    }
    const hint = item.hint ?? (item.required ? undefined : 'Optional.');
    return (
      <Field key={id} label={item.label} hint={hint}>
        {item.kind === 'textarea' ? (
          <TextArea rows={id === 'business' ? 4 : 3} value={answers[id] ?? ''} onChange={(event) => setAnswer(id, event.target.value)} placeholder={item.placeholder} autoFocus={first} />
        ) : (
          <TextInput value={answers[id] ?? ''} onChange={(event) => setAnswer(id, event.target.value)} placeholder={item.placeholder} autoFocus={first} />
        )}
      </Field>
    );
  };

  const cohortLabel = (cohort: OpenCohort) =>
    [cohort.label || 'Next run', formatProgramDate(cohort.startsOn), cohort.remaining === null ? null : `${cohort.remaining} left`].filter(Boolean).join(' · ');

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
            {step < STEPS.length - 1 && STEPS[step].fields.map((id, index) => field(id, index === 0))}

            {step === 2 && cohorts && cohorts.length > 0 && (
              <Chips
                label="Preferred cohort"
                value={cohortLabel(cohorts.find((cohort) => cohort.id === cohortId) ?? cohorts[0])}
                options={cohorts.map(cohortLabel)}
                onChange={(value) => setCohortId(cohorts.find((cohort) => cohortLabel(cohort) === value)?.id ?? cohortId)}
              />
            )}

            {last && (
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
          {last ? 'Send my application' : 'Continue'}
          {!last && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>

      {last && footer && <div className="mt-3 flex flex-col gap-3">{footer}</div>}

      {last && <p className="mt-5 text-[13px] leading-[1.5] text-[var(--pg-body)]">We use your answers to decide who we can help, and nothing else. No newsletter, no list.</p>}
    </form>
  );
}
