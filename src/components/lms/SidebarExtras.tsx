import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Globe, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getMyPlan, getMyServices } from '../../lib/prestige';
import { BrandMark } from '../program-ui';

/**
 * The two ends of the dashboard sidebar: the switcher at the top (where you are, and the way to the team
 * Studio or the public site) and the plan card at the bottom (your membership and how long it has to run).
 */

/** What to call this account: team role, membership plan, or a plain learner. */
function useAccountType(role: string | null) {
  const { session } = useAuth();
  const [plan, setPlan] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    getMyPlan().then(setPlan).catch(() => setPlan(null));
  }, [session?.user.id]);
  const label = role ? `Team · ${role}` : plan === 'partner' ? 'Breadmaker Prestige' : plan === 'hub' ? 'Breadmaker Community' : 'Learner';
  return { label, plan };
}

export function WorkspaceSwitcher({ onNavigate, onPick, role, collapsed = false }: { role: string | null; onNavigate: (route: Route) => void; onPick?: () => void; collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (route: Route) => {
    setOpen(false);
    onPick?.();
    onNavigate(route);
  };
  const row = 'flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] transition-colors hover:bg-[var(--pg-alt)] cursor-pointer';

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? 'Switch area' : undefined}
        title={collapsed ? 'Breadmaker' : undefined}
        className={`flex w-full items-center rounded-[14px] text-left transition-colors hover:bg-[var(--pg-card)]/70 cursor-pointer ${collapsed ? 'justify-center p-2' : 'gap-3 p-2 pr-3'}`}
      >
        <BrandMark className="h-10 w-10" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-editorial text-[19px] font-semibold leading-[1.15] tracking-[-0.01em]">Breadmaker</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--pg-body)]" aria-hidden="true" />
          </>
        )}
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-[260px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[16px] border border-[var(--pg-line)] bg-[var(--pg-card)] py-1">
          <p className="px-3 pb-1 pt-2 font-label text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-body)]">Switch to</p>
          <button role="menuitem" onClick={() => setOpen(false)} className={row}>
            <LayoutDashboard className="h-4 w-4 text-[var(--pg-body)]" aria-hidden="true" /> Dashboard
            <Check className="ml-auto h-4 w-4 text-[var(--pg-accent)]" aria-hidden="true" />
          </button>
          {role && (
            <button role="menuitem" onClick={() => go('studio')} className={row}>
              <ShieldCheck className="h-4 w-4 text-[var(--pg-body)]" aria-hidden="true" /> Studio
            </button>
          )}
          <button role="menuitem" onClick={() => go('home')} className={row}>
            <Globe className="h-4 w-4 text-[var(--pg-body)]" aria-hidden="true" /> Breadmaker site
          </button>
        </div>
      )}
    </div>
  );
}

/** A small ring that fills as the allowance is used up. */
function Ring({ fraction }: { fraction: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 40 40" className="h-11 w-11 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="5" className="stroke-[var(--pg-alt)]" />
      <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-[var(--pg-accent)]" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, fraction)))} />
    </svg>
  );
}

/**
 * PLACEHOLDER: there is no credits system yet, so a free account shows a sample allowance (25 of 100). Members on
 * Prestige see their real developer usage for the month instead. Replace this when credits exist.
 */
const FREE_TRIAL_CREDITS = { used: 25, total: 100 };

/** The plan row at the bottom of the sidebar: plan name, and how much of the allowance is used. Opens the membership page. */
export function SidebarCredits({ role, onNavigate, onPick }: { role: string | null; onNavigate: (route: Route) => void; onPick?: () => void }) {
  const { session } = useAuth();
  const { plan } = useAccountType(role);
  const [usage, setUsage] = useState<{ used: number; total: number } | null>(null);
  useEffect(() => {
    if (!session || plan !== 'partner') return;
    getMyServices()
      .then((services) => setUsage(services ? { used: Math.round(services.agentSpentMinor / 100), total: Math.round(services.agentBudgetMinor / 100) } : null))
      .catch(() => setUsage(null));
  }, [session?.user.id, plan]);

  // Team members have no allowance to show.
  if (role) return null;

  const partner = plan === 'partner';
  const title = partner ? 'Prestige' : plan === 'hub' ? 'Community' : 'Free Trial';
  const figures = partner ? usage : plan === 'hub' ? null : FREE_TRIAL_CREDITS;

  return (
    <button
      type="button"
      onClick={() => {
        onPick?.();
        onNavigate('my-membership');
      }}
      className="flex w-full items-center gap-3 rounded-[14px] p-3 text-left transition-colors hover:bg-[var(--pg-alt)]/60 cursor-pointer"
      aria-label={`${title}. Open membership`}
    >
      <Ring fraction={figures ? figures.used / Math.max(1, figures.total) : 1} />
      <span className="min-w-0">
        <span className="block truncate text-[15px] leading-[1.25] text-[var(--pg-body)]">{title}</span>
        <span className="block truncate text-[15px] leading-[1.3]">
          {figures ? (
            <>
              <strong className="font-semibold">{partner ? `$${figures.used}` : figures.used}</strong>
              <span className="text-[var(--pg-ink)]">/{partner ? `$${figures.total}` : figures.total}</span> <span className="text-[13px] text-[var(--pg-body)]">{partner ? 'usage' : 'Credits'}</span>
            </>
          ) : (
            <span className="text-[13px] text-[var(--pg-body)]">Member</span>
          )}
        </span>
      </span>
    </button>
  );
}
