import React, { useState } from 'react';
import { Section, Label, H2, Pill } from './program-ui';
import { supabase } from '../lib/supabase';
import { reportTouch } from '../lib/attribution';

const INPUT =
  'w-full rounded-[11px] border border-[var(--pg-line)] bg-transparent px-4 py-3.5 text-[17px] text-[var(--pg-ink)] placeholder:text-[var(--pg-body)]/60 focus:border-[var(--pg-accent)] focus:outline-none';

/**
 * An email signup for people who are not ready to buy. The address goes to the lead-capture
 * function, which stores it with the consent wording and hands it to the nurture webhook.
 * `source` says where it was left, e.g. "guide:where-your-business-leaks" or "tools".
 */
export default function LeadCapture({ source, heading = 'Get one email a week.', tone = 'alt' }: { source: string; heading?: string; tone?: 'alt' | 'white' }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) return setError('Add your first name so we can greet you.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Enter a valid email address.');
    if (!consent) return setError('Please tick the box so we can email you.');
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.functions.invoke('lead-capture', { body: { name: name.trim(), email: email.trim(), source, consent: true } });
    setBusy(false);
    if (failure) return setError('We could not save that. Please try again.');
    reportTouch(email);
    setDone(true);
  };

  return (
    <Section tone={tone} pad="default">
      <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div>
          <Label>More insight?</Label>
          <H2 className="mt-7 max-w-[560px]">{heading}</H2>
          <p className="mt-5 max-w-[520px] text-[18px] leading-[1.6] text-[var(--pg-body)]">
            Plain-language notes on fixing the leaks in a small business, from the team that runs these systems for clients. No sales number promised.
          </p>
        </div>
        {done ? (
          <p role="status" className="text-[18px] leading-[1.6]">Thank you. Watch your inbox for the first email.</p>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <label htmlFor={`lead-name-${source}`} className="sr-only">First name</label>
            <input
              id={`lead-name-${source}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoComplete="given-name"
              placeholder="First name"
              className={INPUT}
            />
            <label htmlFor={`lead-${source}`} className="sr-only">Email</label>
            <input
              id={`lead-${source}`}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              autoComplete="email"
              placeholder="you@example.com"
              className={INPUT}
            />
            <label className="flex cursor-pointer items-start gap-3 text-[14.5px] leading-[1.55] text-[var(--pg-body)]">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  setError(null);
                }}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--pg-accent)]"
              />
              <span>
                I agree that Breadmaker Systems (Restart Integrated Systems Ltd.) may store my email and send me guides and updates. I can unsubscribe at any time. See the{' '}
                <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-4">privacy notice</a>.
              </span>
            </label>
            {error && <p role="alert" className="text-[15px] text-red-700">{error}</p>}
            <Pill size="lg" onClick={() => void submit()} className={busy ? 'opacity-60' : ''}>
              {busy ? 'Sending…' : 'Send me the emails'}
            </Pill>
          </form>
        )}
      </div>
    </Section>
  );
}
