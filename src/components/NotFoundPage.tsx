import React from 'react';
import { Route } from '../types';
import { BREADMAKER_THEME, H1, Label, Pill, TextLink, themeStyle } from './program-ui';

export default function NotFoundPage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)]">
      <div className="mx-auto max-w-[1312px] px-6 pb-28 pt-16 lg:pt-24">
        <Label>Page not found</Label>
        <H1 className="mt-8 max-w-[760px]">This page moved or no longer exists.</H1>
        <p className="mt-6 max-w-[620px] text-[18px] leading-[1.6] text-[var(--pg-body)]">
          Breadmaker now runs two programs, Launchpad and Foundry, and the Breadmaker Academy.
          Start from one of those.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Pill size="lg" onClick={() => onNavigate('home')}>Go to the homepage</Pill>
        </div>
      </div>
    </div>
  );
}
