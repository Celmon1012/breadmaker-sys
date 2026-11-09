import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { LEAK_AREAS } from '../../lib/leak-test';
import { coursePath, programForSystem, systemForPillar } from '../../lib/systems';
import { Button, CARD } from './lms-ui';

/** Saved on the signed-in user (auth metadata), under a Breadmaker-only key because the project is shared. */
const META_KEY = 'breadmaker_onboarding';

interface Answers {
  goal: string;
  technical: 'not' | 'comfortable';
  hours: 'low' | 'mid' | 'high';
  support: 'self' | 'guided';
}

export function onboardingDone(user: { user_metadata?: Record<string, unknown> } | null | undefined) {
  return !!user?.user_metadata?.[META_KEY];
}

const CHOICE = 'rounded-full border px-4 py-2 text-[14.5px] transition-colors cursor-pointer';

function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T | ''; options: { id: T; text: string }[]; onChange: (id: T) => void }) {
  return (
    <fieldset className="mt-5">
      <legend className="text-[15px] font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`${CHOICE} ${value === option.id ? 'border-[var(--pg-accent)] bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]' : 'border-[var(--pg-line)] hover:bg-[var(--pg-alt)]'}`}
          >
            {option.text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Four short questions for a learner who has no build yet, then a recommended starting point.
 * Answers are kept on the user so the card does not come back.
 */
export default function OnboardingCard({ openPath, onDone }: { openPath: (path: string) => void; onDone: () => void }) {
  useAuth();
  const [goal, setGoal] = useState('');
  const [technical, setTechnical] = useState<Answers['technical'] | ''>('');
  const [hours, setHours] = useState<Answers['hours'] | ''>('');
  const [support, setSupport] = useState<Answers['support'] | ''>('');
  const [result, setResult] = useState<Answers | null>(null);
  const [saving, setSaving] = useState(false);

  const complete = goal && technical && hours && support;

  const save = async (value: Answers | 'skipped') => {
    setSaving(true);
    // A failed save only means the card may show again; it never blocks the learner.
    try {
      await supabase.auth.updateUser({ data: { [META_KEY]: value } });
    } catch {
      /* ignore */
    }
    setSaving(false);
  };

  const submit = async () => {
    if (!complete) return;
    const answers: Answers = { goal, technical: technical as Answers['technical'], hours: hours as Answers['hours'], support: support as Answers['support'] };
    setResult(answers);
    await save(answers);
  };

  const skip = async () => {
    await save('skipped');
    onDone();
  };

  if (result) {
    const system = systemForPillar(result.goal);
    const program = result.technical === 'comfortable' && result.hours !== 'low' ? 'foundry' : 'launchpad';
    const programName = program === 'foundry' ? 'Foundry' : 'Launchpad';
    const guided = result.support === 'guided';
    const covered = system ? programForSystem(system.id) : undefined;
    return (
      <section className={`${CARD} mt-8 p-6 lg:p-8`} aria-label="Your starting point">
        <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Your starting point</p>
        <h2 className="mt-2 font-editorial text-[24px] font-semibold leading-[1.2]">
          {guided || !system ? `Start with ${programName}.` : `Start with the ${system.name.toLowerCase()} kit.`}
        </h2>
        <p className="mt-2 max-w-[620px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
          {guided || !system
            ? `${programName} gives you a weekly plan, a check-in and a person keeping you moving.${covered && system ? ` It builds ${system.name.toLowerCase()} with you.` : ''}`
            : `You prefer your own pace, so open the kit for your area and do one session at a time. ${programName} is there if you want company later.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {guided || !system ? (
            <Button onClick={() => openPath(`/${program}`)}>See {programName}</Button>
          ) : (
            <Button onClick={() => openPath(coursePath(system.id))}>Open the kit</Button>
          )}
          <Button variant="ghost" onClick={() => openPath('/leak-test')}>Take the Leak Test</Button>
          <Button variant="ghost" onClick={onDone}>Done</Button>
        </div>
      </section>
    );
  }

  return (
    <section className={`${CARD} mt-8 p-6 lg:p-8`} aria-label="Tell us where you are">
      <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Welcome</p>
      <h2 className="mt-2 font-editorial text-[24px] font-semibold leading-[1.2]">Four quick questions, then we point you to a starting place.</h2>
      <Choices
        label="What do you most want to fix?"
        value={goal}
        onChange={setGoal}
        options={LEAK_AREAS.map((area) => ({ id: area.id, text: area.name }))}
      />
      <Choices<'not' | 'comfortable'>
        label="How technical are you?"
        value={technical}
        onChange={(id) => setTechnical(id)}
        options={[
          { id: 'not' as const, text: 'Not technical' },
          { id: 'comfortable' as const, text: 'Comfortable with tools and code' },
        ]}
      />
      <Choices<'low' | 'mid' | 'high'>
        label="How much time can you give each week?"
        value={hours}
        onChange={(id) => setHours(id)}
        options={[
          { id: 'low' as const, text: 'Under 3 hours' },
          { id: 'mid' as const, text: '3 to 6 hours' },
          { id: 'high' as const, text: 'More than 6 hours' },
        ]}
      />
      <Choices<'self' | 'guided'>
        label="How do you like to work?"
        value={support}
        onChange={(id) => setSupport(id)}
        options={[
          { id: 'self' as const, text: 'At my own pace' },
          { id: 'guided' as const, text: 'With a weekly plan and check-ins' },
        ]}
      />
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button onClick={() => void submit()} disabled={!complete} busy={saving}>Show my starting point</Button>
        <button type="button" onClick={() => void skip()} className="text-[14px] text-[var(--pg-body)] underline underline-offset-4 hover:text-[var(--pg-ink)] cursor-pointer">
          Skip for now
        </button>
      </div>
    </section>
  );
}
