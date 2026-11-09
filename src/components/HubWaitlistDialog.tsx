import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { registerSystemInterest } from '../lib/leak-test-api';
import { BREADMAKER_THEME, themeStyle } from './program-ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "Join the waitlist" for Prestige: first name and email, saved against the Hub in the studio waitlist. */
export default function HubWaitlistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStatus('idle');
    setError(null);
    nameRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firstName.trim()) {
      setError('Please enter your first name.');
      return;
    }
    if (!EMAIL.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setStatus('sending');
    try {
      await registerSystemInterest('hub', email.trim(), firstName.trim(), 'hub');
      setStatus('done');
    } catch {
      setError('We could not save that. Please try again in a moment.');
      setStatus('idle');
    }
  };

  const input =
    'mt-2 w-full rounded-[10px] border border-[var(--pg-line)] bg-white px-4 py-3 text-[16px] text-[var(--pg-ink)] placeholder:text-[var(--pg-body)]/60';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center print:hidden" style={themeStyle(BREADMAKER_THEME)}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-waitlist-title"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="relative w-full max-w-[440px] rounded-[17px] border border-[var(--pg-line-soft)] bg-white p-7 font-inter text-[var(--pg-ink)] sm:p-8"
      >
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 cursor-pointer hover:bg-[var(--pg-alt)]" aria-label="Close">
          <X className="h-5 w-5" />
        </button>

        {status === 'done' ? (
          <div role="status">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]">
              <Check className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="hub-waitlist-title" className="mt-5 font-editorial text-[26px] font-semibold leading-[1.15] tracking-[-0.01em]">
              You are on the list.
            </h2>
            <p className="mt-2 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
              Thanks, {firstName.trim()}. We will email {email.trim()} the moment Prestige membership opens.
            </p>
            <button
              onClick={onClose}
              className="mt-6 rounded-full bg-[var(--pg-accent)] px-7 py-3 text-[15px] font-medium text-[var(--pg-accent-ink)] transition-opacity hover:opacity-90 cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 id="hub-waitlist-title" className="font-editorial text-[26px] font-semibold leading-[1.15] tracking-[-0.01em]">
              Join the waitlist
            </h2>
            <p className="mt-2 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
              Leave your first name and email and we will tell you the moment Prestige opens.
            </p>

            <label htmlFor="hub-first-name" className="mt-6 block text-[14.5px] font-medium">
              First name
            </label>
            <input
              id="hub-first-name"
              ref={nameRef}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              className={input}
            />

            <label htmlFor="hub-email" className="mt-4 block text-[14.5px] font-medium">
              Email
            </label>
            <input
              id="hub-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className={input}
            />

            {error && (
              <p role="alert" className="mt-4 rounded-[10px] border border-[var(--pg-accent)] px-4 py-3 text-[14.5px]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="mt-6 w-full rounded-full bg-[var(--pg-accent)] px-7 py-3.5 text-[15px] font-medium text-[var(--pg-accent-ink)] transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              {status === 'sending' ? 'Saving…' : 'Join the waitlist'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
