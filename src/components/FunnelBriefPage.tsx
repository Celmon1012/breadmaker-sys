import React from 'react';
import { Route } from '../types';
import { LAUNCHPAD_THEME, ProgramFooter, ProgramNav, themeStyle } from './program-ui';
import FunnelPortal from './lms/FunnelPortal';

/**
 * The private brief page an applicant reaches from their email: /launchpad/brief/<token>. No account needed;
 * the token in the address is the key. Signed-in members see the same page in the Hub under "My funnel".
 */
export default function FunnelBriefPage({ token, onNavigate }: { token: string; onNavigate: (route: Route) => void }) {
  return (
    <div style={themeStyle(LAUNCHPAD_THEME)} className="min-h-screen bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)] antialiased">
      <ProgramNav announcement={false} brand="Breadmaker" accentWord="Launchpad" links={[]} onBrand={() => onNavigate('home')} />
      <main className="mx-auto max-w-[860px] px-4 pb-16 pt-8 sm:px-6">
        <h1 className="font-editorial text-[34px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[44px]">Your funnel brief.</h1>
        <p className="mb-8 mt-3 max-w-[620px] text-[17px] leading-[1.6] text-[var(--pg-body)]">
          This is the plan your funnel is built from. Read it, ask for changes, choose your address, and approve it when it reads right.
        </p>
        <FunnelPortal token={token} />
      </main>
      <ProgramFooter onNavigate={onNavigate} />
    </div>
  );
}
