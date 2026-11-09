import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Route } from '../types';
import { supabase } from '../lib/supabase';
import { reportTouch } from '../lib/attribution';
import { BREADMAKER_THEME, LeakTestBand, themeStyle } from './program-ui';
import { Button, Field, Notice, TextArea, TextInput } from './lms/lms-ui';
import { REPLY_TIME } from '../lib/program-config';

interface ContactPageProps {
  onNavigate: (route: Route) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export default function ContactPage({ onNavigate }: ContactPageProps) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !EMAIL_PATTERN.test(form.email.trim()) || !form.message.trim()) {
      setError('Please add your name, a valid email and a message.');
      return;
    }
    setStatus('sending');
    const { error: insertError } = await supabase.from('contact_messages').insert({
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || null,
      interests: ['other'],
      message: form.message.trim(),
    });
    if (insertError) {
      setStatus('idle');
      setError('Your message could not be sent. Please try again in a moment.');
      return;
    }
    reportTouch(form.email);
    setStatus('sent');
  };

  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)] antialiased">
      <main className="mx-auto grid max-w-[1312px] items-start gap-12 px-6 pb-14 pt-12 lg:grid-cols-[1fr_560px] lg:gap-20 lg:pb-20 lg:pt-16">
        <section>
          <p className="font-label text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Contact</p>
          <h1 className="mt-5 max-w-[560px] font-editorial text-[36px] font-bold leading-[1.02] tracking-[-0.02em] sm:text-[46px] lg:text-[58px] xl:text-[66px]">Get in touch.</h1>
          <p className="mt-6 max-w-[520px] text-[18px] leading-[1.6] text-[var(--pg-body)]">
            A person reads every message and replies within {REPLY_TIME}.
          </p>
        </section>

        <section className="rounded-[11px] bg-[var(--pg-card)] p-7 border border-[var(--pg-line-soft)] sm:p-10">
          {status === 'sent' ? (
            <div className="py-8 text-center" role="status">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]">
                <Check className="h-6 w-6" />
              </span>
              <h2 className="mt-5 font-editorial text-[28px] font-semibold">Thank you, we have it.</h2>
              <p className="mx-auto mt-2 max-w-[380px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                We will reply to {form.email.trim()} within {REPLY_TIME}.
              </p>
              <Button className="mt-6" variant="ghost" onClick={() => onNavigate('home')}>Back to homepage</Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name">
                  <TextInput value={form.name} onChange={update('name')} autoComplete="name" required />
                </Field>
                <Field label="Email">
                  <TextInput type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
                </Field>
              </div>
              <Field label="Business or website (optional)">
                <TextInput value={form.company} onChange={update('company')} autoComplete="organization" />
              </Field>
              <Field label="Message">
                <TextArea rows={6} value={form.message} onChange={update('message')} placeholder="How can we help?" required />
              </Field>
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" busy={status === 'sending'} className="w-full py-3">Send</Button>
            </form>
          )}
        </section>
      </main>
      <LeakTestBand onNavigate={onNavigate} />
    </div>
  );
}
