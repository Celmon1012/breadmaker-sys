import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, MailCheck, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Route } from '../types';
import { BREADMAKER_THEME, BrandMark, themeStyle } from './program-ui';
import { Button, Field, Notice, TextInput } from './lms/lms-ui';
import AuthShowcase from './AuthShowcase';

interface SigninPageProps {
  onNavigate: (route: Route) => void;
  onSignIn?: () => void;
}

type Mode = 'signin' | 'register';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
// Where confirmation links land. Must be in the shared Supabase's ADDITIONAL_REDIRECT_URLS.
const CONFIRM_REDIRECT = () => `${window.location.origin}/auth/confirm`;

/** Sign in / create account, following the Prof. Sherley account page structure. */
export default function SigninPage({ onNavigate, onSignIn }: SigninPageProps) {
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [values, setValues] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof values, string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'registered'>('idle');
  const [authError, setAuthError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [resetError, setResetError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'loading' | 'sent'>('idle');

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setAuthError(error.message);
      setGoogleBusy(false);
    }
  };

  // Already signed in (or just signed in): continue to where they were going.
  useEffect(() => {
    if (!session) return;
    if (onSignIn) onSignIn();
    else onNavigate('dashboard');
  }, [session]);

  const update = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setAuthError(null);
    setUnconfirmed(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setAuthError(null);
    setStatus('idle');
    setResetOpen(false);
    setUnconfirmed(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (mode === 'register' && !values.firstName.trim()) next.firstName = 'Please add your first name.';
    if (!values.email.trim()) next.email = 'Please add your email.';
    else if (!EMAIL_PATTERN.test(values.email.trim())) next.email = 'Please use a valid email address.';
    if (!values.password) next.password = 'Please add your password.';
    else if (mode === 'register' && values.password.length < 8) next.password = 'Use at least 8 characters.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus('loading');
    setAuthError(null);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
      if (error) {
        const unconfirmed = error.code === 'email_not_confirmed' || error.message === 'Email not confirmed';
        setUnconfirmed(unconfirmed);
        setResendStatus('idle');
        setAuthError(
          unconfirmed ? 'Please confirm your email first. Use the link we sent you, or send a new one.'
          : error.message === 'Invalid login credentials' ? 'That email and password do not match an account.'
          : error.message,
        );
        setStatus('idle');
      }
      // On success the session effect above redirects.
      return;
    }

    // Accounts live in the auth shared with Restart; `app` records where the learner signed up.
    // The /auth/confirm redirect is also what makes the email template send the Breadmaker version.
    const { data, error } = await supabase.auth.signUp({
      email: values.email.trim(),
      password: values.password,
      options: {
        data: { first_name: values.firstName.trim(), last_name: values.lastName.trim(), app: 'breadmaker' },
        emailRedirectTo: CONFIRM_REDIRECT(),
      },
    });
    if (error) {
      setAuthError(error.message);
      setStatus('idle');
      return;
    }
    // An email that already has an account comes back as a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      setAuthError('This email already has an account. Sign in with that password, or reset it from the sign-in tab.');
      setStatus('idle');
      return;
    }
    // With email confirmation on there is no session yet; ask them to confirm.
    if (!data.session) setStatus('registered');
  };

  const resendConfirmation = async () => {
    setResendStatus('loading');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: values.email.trim(),
      options: { emailRedirectTo: CONFIRM_REDIRECT() },
    });
    if (error) {
      setAuthError(error.message);
      setResendStatus('idle');
      return;
    }
    setResendStatus('sent');
  };

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setResetError(null);
    if (!EMAIL_PATTERN.test(values.email.trim())) {
      setResetError('Enter the email address of your account first.');
      return;
    }
    setResetStatus('loading');
    const { error } = await supabase.auth.resetPasswordForEmail(values.email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setResetError(error.message);
      setResetStatus('idle');
      return;
    }
    setResetStatus('sent');
  };

  return (
    <div
      style={themeStyle(BREADMAKER_THEME)}
      className="min-h-screen bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)] antialiased"
    >
      <div className="grid min-h-screen w-full lg:grid-cols-2">
        <div className="flex flex-col px-6 py-6 sm:px-10 lg:px-12 lg:py-8">
          <header className="flex items-center justify-between">
            <button type="button" onClick={() => onNavigate('home')} className="flex items-center gap-2.5 cursor-pointer" aria-label="Breadmaker home">
              <BrandMark className="h-8 w-8" />
              <span className="font-editorial text-[22px] font-semibold tracking-[-0.01em]">Breadmaker</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="inline-flex items-center gap-2 text-[14.5px] font-medium text-[var(--pg-accent)] hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Go back
            </button>
          </header>

          <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          {status === 'registered' ? (
            <div className="py-8 text-center" role="status">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]">
                <MailCheck className="h-6 w-6" />
              </span>
              <h2 className="mt-5 font-editorial text-[28px] font-semibold">Check your inbox.</h2>
              <p className="mx-auto mt-2 max-w-[360px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                Confirm your email address from the link we sent to {values.email.trim()}, then sign in here.
              </p>
              <Button className="mt-6" onClick={() => switchMode('signin')}>
                Back to sign in <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <h1 className="font-editorial text-[36px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </h1>
              <p className="mt-2 text-[15px] leading-[1.6] text-[var(--pg-body)]">
                {mode === 'signin'
                  ? 'Sign in to open your sessions and keep your progress.'
                  : 'Use the email you applied with, so we can enroll you.'}
              </p>

              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={googleBusy}
                className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-[var(--pg-line)] bg-white py-3.5 text-[15px] font-medium transition-colors hover:bg-[var(--pg-alt)] disabled:opacity-60 cursor-pointer"
              >
                <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
                  <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
                </svg>
                {googleBusy ? 'Opening Google…' : 'Continue with Google'}
              </button>
              <div className="mt-5 flex items-center gap-4 text-[13px] text-[var(--pg-body)]" aria-hidden="true">
                <span className="h-px flex-1 bg-[var(--pg-line)]" /> or use your email <span className="h-px flex-1 bg-[var(--pg-line)]" />
              </div>

              {authError && <div className="mt-5"><Notice tone="error">{authError}</Notice></div>}
              {mode === 'signin' && unconfirmed && (
                <div className="mt-3">
                  {resendStatus === 'sent' ? (
                    <p className="flex items-center gap-2 text-[14.5px]" role="status">
                      <MailCheck className="h-4 w-4 text-[var(--pg-accent)]" /> A new confirmation link is on its way to {values.email.trim()}.
                    </p>
                  ) : (
                    <Button type="button" variant="dark" busy={resendStatus === 'loading'} onClick={resendConfirmation}>
                      Send a new confirmation link
                    </Button>
                  )}
                </div>
              )}

              <form onSubmit={submit} noValidate className="mt-5 space-y-4">
                {mode === 'register' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="First name" error={errors.firstName}>
                      <IconInput icon={<UserRound className="h-4 w-4" />}>
                        <TextInput value={values.firstName} onChange={update('firstName')} autoComplete="given-name" className="pl-10" aria-invalid={!!errors.firstName} />
                      </IconInput>
                    </Field>
                    <Field label="Last name">
                      <TextInput value={values.lastName} onChange={update('lastName')} autoComplete="family-name" />
                    </Field>
                  </div>
                )}
                <Field label="Email address" error={errors.email}>
                  <IconInput icon={<Mail className="h-4 w-4" />}>
                    <TextInput type="email" value={values.email} onChange={update('email')} autoComplete="email" placeholder="you@example.com" className="pl-10" aria-invalid={!!errors.email} />
                  </IconInput>
                </Field>
                <Field label="Password" error={errors.password} hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
                  <IconInput icon={<LockKeyhole className="h-4 w-4" />}>
                    <TextInput
                      type={showPassword ? 'text' : 'password'}
                      value={values.password}
                      onChange={update('password')}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      className="pl-10 pr-11"
                      aria-invalid={!!errors.password}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </IconInput>
                </Field>

                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetOpen((value) => !value);
                      setResetStatus('idle');
                      setResetError(null);
                    }}
                    className="text-[14px] font-medium text-[var(--pg-accent)] hover:underline cursor-pointer"
                  >
                    Forgot your password?
                  </button>
                )}

                <Button type="submit" busy={status === 'loading'} className="w-full py-3">
                  {mode === 'signin' ? 'Sign in' : 'Create my account'} <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              {mode === 'signin' && resetOpen && (
                <div className="mt-6 rounded-[12px] bg-[var(--pg-alt)] p-5">
                  {resetStatus === 'sent' ? (
                    <p className="flex items-start gap-3 text-[14.5px] leading-[1.55]" role="status">
                      <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pg-accent)]" />
                      If an account exists for {values.email.trim()}, a reset link is on its way.
                    </p>
                  ) : (
                    <form onSubmit={requestReset}>
                      <p className="flex items-center gap-2 text-[14.5px] font-medium"><KeyRound className="h-4 w-4" /> Reset your password</p>
                      <p className="mt-1 text-[13.5px] text-[var(--pg-body)]">We will email a link to the address above.</p>
                      {resetError && <div className="mt-3"><Notice tone="error">{resetError}</Notice></div>}
                      <Button type="submit" variant="dark" busy={resetStatus === 'loading'} className="mt-4">
                        Send reset link
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
          </main>

          <p className="text-center text-[14.5px] text-[var(--pg-body)]">
            {mode === 'signin' ? 'Need an account? ' : 'Already have an account? '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signin' ? 'register' : 'signin')}
              className="font-semibold text-[var(--pg-ink)] underline underline-offset-4 cursor-pointer"
            >
              {mode === 'signin' ? 'Sign up here' : 'Sign in'}
            </button>
          </p>
        </div>

        {/* The brand panel is inset from the top, right and bottom edges of the screen. */}
        <div className="hidden p-3 pl-0 lg:block">
          <AuthShowcase />
        </div>
      </div>
    </div>
  );
}

function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--pg-body)]">{icon}</span>
      {children}
    </div>
  );
}
