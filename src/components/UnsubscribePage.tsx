import React, { useEffect, useState } from 'react';
import { Route } from '../types';
import { supabase } from '../lib/supabase';
import { BREADMAKER_THEME, H1, Label, Pill, themeStyle } from './program-ui';

/** The page behind the unsubscribe link in every lead email: /unsubscribe?t=<token>. */
export default function UnsubscribePage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const token = new URLSearchParams(window.location.search).get('t') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'unknown' | 'error'>(token ? 'working' : 'unknown');

  useEffect(() => {
    if (!token) return;
    supabase.rpc('unsubscribe_lead', { p_token: token }).then(({ data, error }) => setState(error ? 'error' : data ? 'done' : 'unknown'));
  }, [token]);

  const copy = {
    working: 'Updating your preferences…',
    done: 'You are unsubscribed. We will not email you again.',
    unknown: 'We could not find that link. It may be old or incomplete. Reply to any of our emails and we will remove you by hand.',
    error: 'Something went wrong. Please try the link again in a moment, or reply to any of our emails.',
  }[state];

  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)]">
      <div className="mx-auto max-w-[1312px] px-6 pb-28 pt-16 lg:pt-24">
        <Label>Email preferences</Label>
        <H1 className="mt-8 max-w-[760px]">Unsubscribe</H1>
        <p role="status" className="mt-6 max-w-[620px] text-[18px] leading-[1.6] text-[var(--pg-body)]">{copy}</p>
        <div className="mt-9">
          <Pill size="lg" onClick={() => onNavigate('home')}>Go to the homepage</Pill>
        </div>
      </div>
    </div>
  );
}
