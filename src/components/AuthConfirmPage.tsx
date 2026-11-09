import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Route } from '../types';
import { BREADMAKER_THEME, themeStyle } from './program-ui';
import { Button, Loading } from './lms/lms-ui';

interface AuthConfirmPageProps {
  onNavigate: (route: Route) => void;
}

/**
 * Landing page for links in our auth emails (/auth/confirm).
 * The Breadmaker email template links here with ?token_hash=…&type=…, so the learner never
 * sees the shared Supabase domain. Links from the stock template arrive with the session in
 * the URL hash instead, which the Supabase client picks up on its own.
 */
export default function AuthConfirmPage({ onNavigate }: AuthConfirmPageProps) {
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const tokenHash = query.get('token_hash');
    const type = (query.get('type') || 'signup') as EmailOtpType;
    const next: Route = type === 'recovery' ? 'reset-password' : 'dashboard';

    if (hash.get('error') || query.get('error')) {
      setFailed(true);
      return;
    }

    (async () => {
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) {
          setFailed(true);
          return;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) onNavigate(next);
      else setFailed(true);
    })();
  }, []);

  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="min-h-screen bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)] antialiased">
      <header className="mx-auto flex max-w-[1312px] items-center px-4 py-6 sm:px-6">
        <button onClick={() => onNavigate('home')} className="font-editorial text-[19px] font-semibold tracking-[-0.01em] cursor-pointer lg:text-[21px]">
          Breadmaker <span className="text-[var(--pg-accent)]">Academy</span>
        </button>
      </header>

      <main className="mx-auto max-w-[520px] px-4 pb-20 pt-8 sm:px-6 lg:pt-16">
        <section className="rounded-[11px] bg-[var(--pg-card)] p-7 border border-[var(--pg-line-soft)] sm:p-10">
          {failed ? (
            <div className="text-center">
              <h1 className="font-editorial text-[30px] font-semibold">This link has expired.</h1>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                Email links work once and for a short time. If you already confirmed, just sign in. Otherwise sign in and we will send a fresh link.
              </p>
              <Button className="mt-6" onClick={() => onNavigate('signin')}>
                Go to sign in <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Loading label="Confirming your email…" />
          )}
        </section>
      </main>
    </div>
  );
}
