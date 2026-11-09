import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Route } from '../types';
import { errorMessage } from '../lib/lms';
import { PARTNER_AGENT_BUDGET_USD, PARTNER_PRICE_USD, PARTNER_SEATS, PARTNER_UPTIME, submitPartnerApplication } from '../lib/prestige';
import { REPLY_TIME } from '../lib/program-config';
import { BREADMAKER_THEME, Label, ProgramFooter, ProgramNav, themeStyle } from './program-ui';
import { Button, Field, Notice, Select, TextArea, TextInput } from './lms/lms-ui';

/** The Breadmaker Prestige application: same layout as the Foundry and Launchpad forms, at /membership/apply. */

interface PartnerApplyPageProps {
  onNavigate: (route: Route) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const INCLUDES = [
  {
    title: 'A developer on WhatsApp',
    body: `Message your own developer to change code, fix bugs and ship updates on your repo. $${PARTNER_AGENT_BUDGET_USD} of usage each month.`,
  },
  {
    title: 'Hosted on your own server',
    body: `Monitored and backed up, with a ${PARTNER_UPTIME} monthly uptime target. If we miss it, you get a credit against that month's fee.`,
  },
  { title: 'Priority support', body: 'Your tickets go to the top, and our agentic team handles them.' },
  { title: 'The private community', body: 'The members-only room, plus the resources and tools behind the builds.' },
];

const START_OPTIONS = ['As soon as possible', 'Within a month', 'In the next three months', 'Just exploring'];

export default function PartnerApplyPage({ onNavigate }: PartnerApplyPageProps) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', business: '' });
  const [answers, setAnswers] = useState({ needs: '', repo: '', outage: '', start: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Apply for Breadmaker Prestige | Breadmaker Systems';
    return () => {
      document.title = previous;
    };
  }, []);

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setError(null);
  };
  const setAnswer = (field: keyof typeof answers, value: string) => {
    setAnswers((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !EMAIL_PATTERN.test(form.email.trim())) {
      setError('Please add your name and a valid email.');
      return;
    }
    if (!answers.needs.trim()) {
      setError('Tell us a little about what you want us to run for you.');
      return;
    }
    setStatus('sending');
    try {
      // The answers share one text field on the application, one labelled line each.
      const needs = [
        answers.needs.trim(),
        answers.repo.trim() && `Code and projects: ${answers.repo.trim()}`,
        answers.outage.trim() && `If it went down: ${answers.outage.trim()}`,
        answers.start && `Start: ${answers.start}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      await submitPartnerApplication({ name: form.name, email: form.email, phone: form.phone, business: form.business, needs });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(errorMessage(err));
    }
  };

  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="min-h-screen bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)] antialiased">
      <ProgramNav
        announcement={false}
        brand="Breadmaker"
        accentWord="Prestige"
        links={[{ id: 'program', label: 'Back to Prestige', back: true, onClick: () => onNavigate('membership') }]}
        onBrand={() => onNavigate('home')}
      />

      <main className="mx-auto grid max-w-[1312px] items-start gap-12 px-4 pb-14 pt-6 sm:px-6 lg:grid-cols-[1fr_620px] lg:gap-20 lg:pb-20 lg:pt-10">
        <section className="pt-6 lg:pt-16">
          <Label className="block">Breadmaker Prestige</Label>
          <h1 className="mt-5 max-w-[560px] font-editorial text-[36px] font-bold leading-[1.04] tracking-[-0.02em] sm:text-[46px]">Apply for a Prestige seat.</h1>
          <p className="mt-6 max-w-[520px] text-[18px] leading-[1.6] text-[var(--pg-body)]">
            {`We have ${PARTNER_SEATS} seats in this first group, at $${PARTNER_PRICE_USD} a month. We read every application and reply within ${REPLY_TIME}.`}
          </p>

          <div className="mt-10 max-w-[520px]">
            <Label className="block">Inside Prestige</Label>
            <h2 className="mt-3 font-editorial text-[30px] font-semibold leading-[1.15] tracking-[-0.01em]">What you get.</h2>
            <ul className="mt-6 space-y-5">
              {INCLUDES.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-[var(--pg-accent)]" aria-hidden="true" />
                  <div>
                    <p className="text-[17px] font-semibold">{item.title}</p>
                    <p className="mt-1 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-[11px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-7 sm:p-10">
          {status === 'sent' ? (
            <div className="py-6" role="status">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]">
                <Check className="h-6 w-6" />
              </span>
              <h2 className="mt-5 font-editorial text-[30px] font-semibold leading-[1.15]">We have your application.</h2>
              <p className="mt-3 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">Thanks, {form.name.trim()}. We will reply to {form.email.trim()}.</p>
              <ol className="mt-6 space-y-3 text-[15.5px] leading-[1.55]">
                {[`We read your application and reply within ${REPLY_TIME}.`, 'If it is a fit, we set up a short call.', 'Once you are in, we connect your repo and WhatsApp number and move your project onto your own server.'].map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="font-label text-[12.5px] text-[var(--pg-accent)]">{String(index + 1).padStart(2, '0')}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button onClick={() => onNavigate('home')}>Back to homepage</Button>
                <Button variant="ghost" onClick={() => onNavigate('membership')}>See Prestige</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name">
                  <TextInput value={form.name} onChange={update('name')} autoComplete="name" required />
                </Field>
                <Field label="Email">
                  <TextInput type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
                </Field>
                <Field label="Phone or WhatsApp (optional)">
                  <TextInput value={form.phone} onChange={update('phone')} autoComplete="tel" />
                </Field>
                <Field label="Business or website (optional)">
                  <TextInput value={form.business} onChange={update('business')} autoComplete="organization" />
                </Field>
              </div>

              <Field label="What should we run for you? *">
                <TextArea rows={4} value={answers.needs} onChange={(e) => setAnswer('needs', e.target.value)} placeholder="Your business, what people depend on, and what you want off your plate." />
              </Field>
              <Field label="Where does your code live?" hint="Optional, but it tells us where we would start.">
                <TextInput value={answers.repo} onChange={(e) => setAnswer('repo', e.target.value)} placeholder="A GitHub repo, a site, or what you run today" />
              </Field>
              <Field label="What happens if your systems go down?">
                <TextInput value={answers.outage} onChange={(e) => setAnswer('outage', e.target.value)} placeholder="e.g. we lose orders, customers cannot log in" />
              </Field>
              <Field label="When do you want to start?">
                <Select value={answers.start} onChange={(e) => setAnswer('start', e.target.value)}>
                  <option value="">Choose one…</option>
                  {START_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </Field>

              {error && <Notice tone="error">{error}</Notice>}

              <div className="flex flex-col gap-3 pt-1">
                <Button type="submit" busy={status === 'sending'} className="w-full px-7 py-3">Send my application</Button>
              </div>
              <p className="text-[13px] leading-[1.5] text-[var(--pg-body)]">We use your answers to decide who we can help, and nothing else. No newsletter, no list.</p>
            </form>
          )}
        </section>
      </main>

      <ProgramFooter onNavigate={onNavigate} />
    </div>
  );
}
