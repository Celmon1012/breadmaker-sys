import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Route } from '../types';
import { BREADMAKER_THEME, themeStyle } from './program-ui';
import { Button, Field, Loading, Notice, TextInput } from './lms/lms-ui';

interface ResetPasswordPageProps {
  onNavigate: (route: Route) => void;
}

export default function ResetPasswordPage({ onNavigate }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [readyForReset, setReadyForReset] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const started = useRef(false);

  useEffect(() => {
    // The recovery link logs the user in via a one-time session, which is what
    // authorizes the updateUser({ password }) call below. The Breadmaker email links
    // here with ?token_hash=… to verify; the stock email puts the session in the URL
    // hash, which the Supabase client detects on its own.
    // The token is single-use, so verify it once even when the effect runs twice.
    if (!started.current) {
      started.current = true;
      const tokenHash = new URLSearchParams(window.location.search).get('token_hash');
      (async () => {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
          window.history.replaceState({}, '', window.location.pathname);
          if (error) {
            setReadyForReset(false);
            setCheckingSession(false);
            return;
          }
        }
        const { data: { session } } = await supabase.auth.getSession();
        setReadyForReset(!!session);
        setCheckingSession(false);
      })();
    }

    const { data: { subscription } }= supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReadyForReset(true);
        setCheckingSession(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
  };

  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="min-h-screen bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)] antialiased">
      <header className="mx-auto flex max-w-[1312px] items-center px-4 py-6 sm:px-6">
        <button onClick={() => onNavigate('home')} className="font-editorial text-[19px] font-semibold tracking-[-0.01em] cursor-pointer lg:text-[21px]">
          Breadmaker <span className="text-[var(--pg-accent)]">Academy</span>
        </button>
      </header>

      <main className="mx-auto max-w-[520px] px-4 pb-20 pt-8 sm:px-6 lg:pt-16">
        <section className="rounded-[11px] bg-[var(--pg-card)] p-7 border border-[var(--pg-line-soft)] sm:p-10">
          {checkingSession ? (
            <Loading label="Checking your reset link…" />
          ) : success ? (
            <div className="text-center" role="status">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]">
                <Check className="h-6 w-6" />
              </span>
              <h1 className="mt-5 font-editorial text-[30px] font-semibold">Password updated.</h1>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">Your new password is active.</p>
              <Button className="mt-6" onClick={() => onNavigate('dashboard')}>
                Go to my learning <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : !readyForReset ? (
            <div className="text-center">
              <h1 className="font-editorial text-[30px] font-semibold">This link has expired.</h1>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                Reset links work once and for a short time. Request a new one from the sign-in page.
              </p>
              <Button className="mt-6" onClick={() => onNavigate('signin')}>Back to sign in</Button>
            </div>
          ) : (
            <>
              <p className="inline-flex items-center gap-2 font-label font-semibold text-[12.5px] uppercase tracking-[0.06em] text-[var(--pg-accent)]">
                <KeyRound className="h-4 w-4" /> Reset your password
              </p>
              <h1 className="mt-4 font-editorial text-[30px] font-semibold leading-[1.15]">Choose a new password.</h1>
              {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}
              <form onSubmit={handleReset} className="mt-6 space-y-4">
                <Field label="New password" hint="At least 8 characters.">
                  <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </Field>
                <Field label="Confirm new password">
                  <TextInput type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                </Field>
                <Button type="submit" busy={loading} className="w-full py-3">Update password</Button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
