import React from 'react';
import { Route } from '../types';
import { useAuth } from '../context/AuthContext';
import { BREADMAKER_THEME, ProgramNav, scrollToId } from './program-ui';

/** The site-wide header for pages that do not render their own (About, Resources, legal pages and so on). */
export default function SiteHeader({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const { session } = useAuth();

  const findYourPath = () => {
    onNavigate('home');
    // The homepage mounts after navigation; scroll once it is there.
    window.setTimeout(() => scrollToId('programs'), 150);
  };

  return (
    <ProgramNav
      theme={BREADMAKER_THEME}
      brand="Breadmaker"
      accentWord="Systems"
      onBrand={() => onNavigate('home')}
      links={[
        { id: 'about', label: 'About', onClick: () => onNavigate('about') },
        { id: 'membership', label: 'Membership', onClick: () => onNavigate('membership') },
        { id: 'guides', label: 'Guides', onClick: () => onNavigate('guides') },
        { id: 'tools', label: 'Tools', onClick: () => onNavigate('tools') },
        { id: 'contact', label: 'Contact', onClick: () => onNavigate('contact') },
      ]}
      ctaLabel="Choose your path"
      onCta={findYourPath}
      secondaryLabel={session ? 'Dashboard' : 'Sign in'}
      onSecondary={() => onNavigate(session ? 'dashboard' : 'signin')}
    />
  );
}
