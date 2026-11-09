import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { isKitSlug } from '../../lib/systems';
import { ArrowLeft, ArrowRight, Bot, BookOpen, ChartColumn, Check, CreditCard, Gift, Globe, Inbox, LayoutDashboard, LayoutTemplate, LifeBuoy, MessageCircle, Plus, Sparkles, LoaderCircle, LogOut, Menu, Plug, PanelLeftClose, PanelLeftOpen, UserRound, UsersRound, X } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { BREADMAKER_THEME, BrandMark, FOUNDRY_THEME, LAUNCHPAD_THEME, ProgramFooter, ProgramTheme, themeStyle } from '../program-ui';
import SidebarAccount from './AccountMenu';
import { SidebarCredits, WorkspaceSwitcher } from './SidebarExtras';
import Avatar, { useMyAvatar } from './Avatar';
import { Program, TeamRole, loadTeamRole } from '../../lib/lms';
import { getMyMembership } from '../../lib/hub';
import { getCommunityLink } from '../../lib/support';
import { myFunnelToken, myFunnels } from '../../lib/portal';
import { myLeads } from '../../lib/agents';
import { COURSES_ENABLED } from '../../lib/features';

/**
 * Shared chrome for the LMS screens (catalog, course, lesson player, learner
 * dashboard, team studio). Same editorial system as the marketing pages:
 * cream paper, serif headings, mono labels, white cards.
 */

export const CARD = 'rounded-[17px] bg-[var(--pg-card)] border border-[var(--pg-line-soft)]';

export function programTheme(program: Program): ProgramTheme {
  if (program === 'foundry') return FOUNDRY_THEME;
  if (program === 'launchpad') return LAUNCHPAD_THEME;
  return BREADMAKER_THEME;
}

/** "Kit" for a single-system course, otherwise the program's own label. */
export const courseLabel = (course: { slug: string; program: Program }) => (isKitSlug(course.slug) ? 'Kit' : PROGRAM_LABEL[course.program]);

export const PROGRAM_LABEL: Record<Program, string> = {
  foundry: 'Breadmaker Foundry',
  launchpad: 'Breadmaker Launchpad',
  general: 'Breadmaker',
};

/** The caller's team role, or null for learners and signed-out visitors. */
export function useTeamRole() {
  const { session } = useAuth();
  const [role, setRole] = useState<TeamRole | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadTeamRole().then((value) => {
      if (!cancelled) {
        setRole(value);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);
  return { role, loading };
}

export interface DrawerItem {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  onClick: () => void;
  badge?: string | number;
}

type ShellSection = 'dashboard' | 'courses' | 'enquiries' | 'funnel' | 'agents' | 'integrations' | 'templates' | 'analytics' | 'my-membership' | 'profile' | 'billing' | 'referrals' | 'support' | 'studio' | null;

/** Profile avatar with a dropdown: who is signed in, Profile, Billing and Sign out. */
function UserMenu({ email, name, onProfile, onBilling, onSignOut }: { email: string; name: string; onProfile: () => void; onBilling: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const photo = useMyAvatar(user?.id);

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

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const item = 'flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14.5px] transition-colors hover:bg-[var(--pg-alt)] cursor-pointer';

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-85 cursor-pointer"
      >
        <Avatar url={photo} name={name || email} size={40} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-[250px] overflow-hidden rounded-[14px] border border-[var(--pg-line)] bg-white py-1">
          <div className="border-b border-[var(--pg-line-soft)] px-4 py-3">
            {name && <p className="truncate text-[14.5px] font-semibold">{name}</p>}
            <p className="truncate text-[13px] text-[var(--pg-body)]">{email}</p>
          </div>
          <button role="menuitem" onClick={choose(onProfile)} className={item}><UserRound className="h-4 w-4" /> Profile</button>
          <button role="menuitem" onClick={choose(onBilling)} className={item}><CreditCard className="h-4 w-4" /> Billing</button>
          <button role="menuitem" onClick={choose(onSignOut)} className={`${item} border-t border-[var(--pg-line-soft)]`}><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export function LmsShell({
  active,
  onNavigate,
  children,
  wide = false,
  hideNav = false,
  drawerGroups,
  drawerTitle = 'Menu',
  headerMobileOnly = false,
  quickAction,
}: {
  active: ShellSection;
  onNavigate: (route: Route) => void;
  children: React.ReactNode;
  wide?: boolean;
  /** hide the top menu links, for pages that carry their own sidebar */
  hideNav?: boolean;
  /** when given, the mobile menu is a slide-in sidebar with these items */
  drawerGroups?: SidebarGroup[];
  drawerTitle?: string;
  /** hide the top header from the lg breakpoint up, for pages whose sidebar carries the logo and account */
  headerMobileOnly?: boolean;
  quickAction?: { label: string; onClick: () => void };
}) {
  const { session, signOut } = useAuth();
  const { role } = useTeamRole();
  const [open, setOpen] = useState(false);

  const drawer = !!drawerGroups;

  useEffect(() => {
    if (!open || !drawer) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, drawer]);

  const links: { key: Exclude<ShellSection, null>; label: string; show: boolean }[] = [
    { key: 'dashboard', label: 'Dashboard', show: !!session },
    { key: 'profile', label: 'Profile', show: !!session },
    { key: 'billing', label: 'Billing', show: !!session },
    { key: 'studio', label: 'Studio', show: !!role },
  ];

  const go = (route: Route) => {
    setOpen(false);
    onNavigate(route);
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    onNavigate('home');
  };

  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="flex min-h-screen flex-col bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)] antialiased">
      <header className={`${headerMobileOnly ? 'lg:hidden ' : ''}sticky top-0 z-40 border-b border-[var(--pg-line-soft)] backdrop-blur transition-colors ${open ? 'bg-white' : 'bg-[var(--pg-bg)]/95'}`}>
        <div className={`mx-auto flex items-center gap-6 px-4 py-4 sm:px-6 lg:px-10 max-w-[1760px]`}>
          <button
            onClick={() => go('home')}
            className="flex items-center gap-2.5 font-editorial text-[19px] font-semibold tracking-[-0.01em] whitespace-nowrap cursor-pointer"
          >
            <BrandMark />
            <span>Breadmaker <span className="text-[var(--pg-accent)]">Hub</span></span>
          </button>

          <nav className={`ml-4 items-center gap-1 ${hideNav ? 'hidden' : 'hidden md:flex'}`}>
            {links
              .filter((link) => link.show)
              .map((link) => (
                <button
                  key={link.key}
                  onClick={() => go(link.key)}
                  className={`rounded-full px-4 py-2 text-[14.5px] transition-colors cursor-pointer ${
                    active === link.key
                      ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]'
                      : 'text-[var(--pg-ink)] hover:bg-[var(--pg-alt)]'
                  }`}
                >
                  {link.label}
                </button>
              ))}
          </nav>

          <div className={`ml-auto hidden items-center gap-3 ${drawer ? 'lg:flex' : 'md:flex'}`}>
            {session ? (
              <UserMenu
                email={session.user.email ?? ''}
                name={String(session.user.user_metadata?.full_name ?? session.user.user_metadata?.first_name ?? '')}
                onProfile={() => go('profile')}
                onBilling={() => go('billing')}
                onSignOut={handleSignOut}
              />
            ) : (
              <button
                onClick={() => go('signin')}
                className="rounded-full bg-[var(--pg-accent)] px-5 py-2.5 text-[14px] font-medium text-[var(--pg-accent-ink)] transition-opacity hover:opacity-90 cursor-pointer"
              >
                Sign in
              </button>
            )}
          </div>

          <button
            onClick={() => setOpen((value) => !value)}
            className={`ml-auto rounded-full p-2 cursor-pointer ${drawer ? 'lg:hidden' : 'md:hidden'}`}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && !drawer && (
          <div className="border-t border-[var(--pg-line-soft)] bg-white px-4 pb-5 pt-3 md:hidden">
            <div className="flex flex-col gap-1">
              {links
                .filter((link) => link.show)
                .map((link) => (
                  <button
                    key={link.key}
                    onClick={() => go(link.key)}
                    className={`rounded-xl px-4 py-3 text-left text-[16px] cursor-pointer ${
                      active === link.key ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'hover:bg-[var(--pg-alt)]'
                    }`}
                  >
                    {link.label}
                  </button>
                ))}
              {session ? (
                <button onClick={handleSignOut} className="rounded-xl px-4 py-3 text-left text-[16px] hover:bg-[var(--pg-alt)] cursor-pointer">
                  Sign out
                </button>
              ) : (
                <button onClick={() => go('signin')} className="rounded-xl px-4 py-3 text-left text-[16px] hover:bg-[var(--pg-alt)] cursor-pointer">
                  Sign in
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <AnimatePresence>
        {open && drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col overflow-y-auto bg-[var(--pg-bg)] p-3"
              style={themeStyle(BREADMAKER_THEME)}
              role="dialog"
              aria-label={drawerTitle}
            >
              <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-full p-2 cursor-pointer" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
              <SidebarBody groups={drawerGroups!} onNavigate={onNavigate} onPick={() => setOpen(false)} quickAction={quickAction} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex-1">{children}</div>
      <ProgramFooter onNavigate={onNavigate} />
    </div>
  );
}

/** The way out of the learner area and studio, back to the marketing site. */
export function BackToSite({ onClick, className = '', iconOnly = false }: { onClick: () => void; className?: string; iconOnly?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={iconOnly ? 'Back to site' : undefined}
      title={iconOnly ? 'Back to site' : undefined}
      className={`inline-flex items-center rounded-xl py-2.5 text-left text-[14.5px] font-semibold text-[var(--pg-ink)] transition-colors hover:bg-[var(--pg-alt)] cursor-pointer ${
        iconOnly ? 'w-full justify-center px-0' : 'gap-2.5 px-3.5'
      } ${className}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> {!iconOnly && 'Back to site'}
    </button>
  );
}

/** Sidebar banner for Breadmaker Prestige: links to the membership page, and hides for active members. */
const BANNER_KEY = 'bm-prestige-banner-closed';

/** Prestige promotion for people who are not members yet. The X hides it on this device. */
export function PrestigeBanner({ onNavigate, className = '' }: { onNavigate: (route: Route) => void; className?: string }) {
  const { session } = useAuth();
  const [active, setActive] = useState<boolean | null>(null);
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!session) return;
    getMyMembership()
      .then((membership) => setActive(!!membership?.active))
      .catch(() => setActive(false));
  }, [session?.user.id]);
  if (active !== false || closed) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(BANNER_KEY, '1');
    } catch {
      /* the banner just comes back next visit */
    }
  };
  return (
    <div className={`relative overflow-hidden rounded-[16px] bg-[var(--pg-ink)] text-[var(--pg-bg)] ${className}`}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--pg-accent)]" />
      <button
        onClick={close}
        aria-label="Dismiss"
        className="absolute right-2.5 top-3.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--pg-label-dark)] transition-colors hover:bg-white/10 hover:text-[var(--pg-bg)] cursor-pointer"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <button onClick={() => onNavigate('membership')} className="group block w-full p-5 text-left cursor-pointer">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-label text-[10.5px] font-semibold uppercase tracking-[0.08em]">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> Breadmaker Prestige
        </span>
        <span className="mt-3 block font-editorial text-[19px] font-semibold leading-[1.2] tracking-[-0.01em]">A team behind your systems.</span>
        <ul className="mt-3 space-y-1.5 text-[13.5px] leading-[1.35] text-[var(--pg-label-dark)]">
          {['A private member community', 'A developer on WhatsApp (Prestige)', 'Priority support (Prestige)'].map((line) => (
            <li key={line} className="flex gap-2">
              <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[var(--pg-accent)]" aria-hidden="true" /> {line}
            </li>
          ))}
        </ul>
        <span className="mt-4 flex items-center justify-center gap-1.5 rounded-full bg-[var(--pg-bg)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--pg-ink)] transition-transform group-hover:-translate-y-0.5">
          Join Prestige <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

/** The WhatsApp community, for Prestige members only (the link never reaches anyone else). */
export function CommunityWidget({ className = '' }: { className?: string }) {
  const { session } = useAuth();
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    getCommunityLink().then(setLink).catch(() => setLink(null));
  }, [session?.user.id]);
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 rounded-[14px] border border-[var(--pg-line)] bg-[var(--pg-card)] p-3.5 transition-colors hover:bg-[var(--pg-alt)] ${className}`}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold leading-[1.25]">WhatsApp community</span>
        <span className="block text-[12.5px] leading-[1.3] text-[var(--pg-body)]">Chat with Prestige members</span>
      </span>
      <ArrowRight className="ml-auto h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </a>
  );
}

/** Both sidebar cards, stacked. */
export function SidebarPromos({ onNavigate, className = '' }: { onNavigate: (route: Route) => void; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <CommunityWidget />
    </div>
  );
}

export interface SidebarGroup {
  label?: string;
  items: DrawerItem[];
}

/**
 * The app frame for the learner area and the studio: a floating rounded sidebar (logo, grouped
 * navigation, promos, account) beside a rounded content panel. Below lg the shell header and
 * drawer take over.
 */
/**
 * Everything inside the dashboard sidebar: logo, grouped navigation, promos, "Back to site" and the
 * signed-in account. The desktop panel and the mobile drawer both render this, so they always match.
 */
export function SidebarBody({
  groups,
  onNavigate,
  onPick,
  collapsed = false,
  onToggleCollapsed,
  quickAction,
}: {
  groups: SidebarGroup[];
  onNavigate: (route: Route) => void;
  /** called before an item runs, so the mobile drawer can close itself */
  onPick?: () => void;
  /** icon-only rail (desktop panel only) */
  collapsed?: boolean;
  /** when given, a button to minimise or expand the sidebar is shown */
  onToggleCollapsed?: () => void;
  quickAction?: { label: string; onClick: () => void };
}) {
  const { role } = useTeamRole();
  const go = (route: Route) => {
    onPick?.();
    onNavigate(route);
  };
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Minimise sidebar';
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <>
      {/* Top: where you are, and the way to the Studio or the public site. */}
      <WorkspaceSwitcher role={role} onNavigate={onNavigate} onPick={onPick} collapsed={collapsed} />

      {/* Middle: the navigation, in its own card. */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-[18px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-3">
      {!collapsed && quickAction && (
        <button onClick={() => { onPick?.(); quickAction.onClick(); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--pg-ink)] px-3.5 py-2.5 text-[13.5px] font-medium text-[var(--pg-bg)] transition-opacity hover:opacity-90 cursor-pointer">
          <Plus className="h-4 w-4" aria-hidden="true" /> {quickAction.label}
        </button>
      )}

      <nav className={`flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${!collapsed && quickAction ? 'mt-4' : ''}`} aria-label="Dashboard">
        {groups.filter((group) => group.items.length > 0).map((group, index) => (
          <div key={group.label ?? index} className={index > 0 ? 'mt-3 border-t border-[var(--pg-line-soft)] pt-3' : ''}>
            {group.label && !collapsed && <p className="px-3.5 pb-1.5 font-label text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-body)]">{group.label}</p>}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    onPick?.();
                    item.onClick();
                  }}
                  aria-current={item.active ? 'page' : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`relative inline-flex items-center rounded-xl py-2.5 text-left text-[14.5px] transition-colors cursor-pointer ${
                    collapsed ? 'justify-center px-0' : 'gap-3 px-3.5'
                  } ${
                    item.active
                      ? 'bg-[var(--pg-alt)] font-semibold text-[var(--pg-ink)]'
                      : 'text-[var(--pg-ink)] hover:bg-[var(--pg-alt)]'
                  }`}
                >
                  <item.icon className="h-[17px] w-[17px] shrink-0" /> {!collapsed && item.label}
                  {!collapsed && item.badge !== undefined && <span className="ml-auto rounded-full bg-[var(--pg-accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--pg-accent-ink)]">{item.badge}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {onToggleCollapsed && (
        <button
          onClick={onToggleCollapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
          className={`mt-2 flex h-9 shrink-0 items-center rounded-lg text-[var(--pg-body)] transition-colors hover:bg-[var(--pg-alt)] hover:text-[var(--pg-ink)] cursor-pointer ${collapsed ? 'w-full justify-center' : 'gap-2.5 px-3.5 text-[13.5px]'}`}
        >
          <ToggleIcon className="h-[18px] w-[18px]" aria-hidden="true" /> {!collapsed && 'Minimise'}
        </button>
      )}
      </div>

      {/* Bottom: the community link, then one card with your plan and you. */}
      {!collapsed && (
        <div className="mt-3">
          <SidebarPromos onNavigate={go} />
        </div>
      )}

      <div className="mt-3 rounded-[18px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)]">
        {!collapsed && (
          <>
            <SidebarCredits role={role} onNavigate={onNavigate} onPick={onPick} />
            <div className="mx-3 border-t border-[var(--pg-line-soft)]" />
          </>
        )}
        <SidebarAccount role={role} onNavigate={onNavigate} onPick={onPick} collapsed={collapsed} />
      </div>
    </>
  );
}

/**
 * The app frame for the learner area and the studio: a floating rounded sidebar beside a rounded
 * content panel. Below lg the shell header and drawer take over.
 */
const SIDEBAR_KEY = 'bm-sidebar-collapsed';

export function DashboardFrame({
  groups,
  onNavigate,
  children,
  quickAction,
}: {
  groups: SidebarGroup[];
  onNavigate: (route: Route) => void;
  children: React.ReactNode;
  quickAction?: { label: string; onClick: () => void };
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () =>
    setCollapsed((value) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, value ? '0' : '1');
      } catch {
        /* the sidebar just reopens next visit */
      }
      return !value;
    });
  return (
    <div className={`pb-20 lg:grid lg:items-start lg:gap-3 lg:p-3 lg:pb-6 lg:transition-[grid-template-columns] lg:duration-200 ${collapsed ? 'lg:grid-cols-[76px_1fr]' : 'lg:grid-cols-[272px_1fr]'}`}>
      <aside className="hidden lg:block lg:self-stretch">
        <div className="sticky top-3 flex h-[calc(100vh-1.5rem)] flex-col">
          <SidebarBody groups={groups} onNavigate={onNavigate} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} quickAction={quickAction} />
        </div>
      </aside>

      <div className="min-w-0 px-4 py-8 sm:px-6 lg:min-h-[calc(100vh-1.5rem)] lg:rounded-[22px] lg:border lg:border-[var(--pg-line-soft)] lg:bg-[var(--pg-card)] lg:px-10 lg:py-10">
        {children}
      </div>
    </div>
  );
}

const InLearnerLayout = createContext(false);

export function PageContainer({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const inLayout = useContext(InLearnerLayout);
  if (inLayout) return <div className={`min-w-0 ${className}`}>{children}</div>;
  return <main className={`mx-auto max-w-[1312px] px-4 py-10 sm:px-6 lg:py-14 ${className}`}>{children}</main>;
}

const LEARNER_NAV: { key: 'dashboard' | 'courses' | 'enquiries' | 'funnel' | 'agents' | 'integrations' | 'templates' | 'analytics' | 'my-membership' | 'profile' | 'billing' | 'referrals' | 'support'; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'courses', label: 'Courses', icon: BookOpen },
  { key: 'enquiries', label: 'Enquiries', icon: Inbox },
  { key: 'funnel', label: 'Funnels', icon: Globe },
  { key: 'agents', label: 'Agents', icon: Bot },
  { key: 'integrations', label: 'Integrations', icon: Plug },
  { key: 'templates', label: 'Templates', icon: LayoutTemplate },
  { key: 'analytics', label: 'Analytics', icon: ChartColumn },
  { key: 'profile', label: 'Profile', icon: UserRound },
  { key: 'billing', label: 'Billing', icon: CreditCard },
  { key: 'referrals', label: 'Referrals', icon: Gift },
  { key: 'support', label: 'Support', icon: LifeBuoy },
];

/** The learner area: LMS shell with a left sidebar, like the team studio. */
export function LearnerLayout({
  active,
  onNavigate,
  children,
}: {
  active: 'dashboard' | 'courses' | 'enquiries' | 'funnel' | 'agents' | 'integrations' | 'templates' | 'analytics' | 'my-membership' | 'profile' | 'billing' | 'referrals' | 'support';
  onNavigate: (route: Route) => void;
  children: React.ReactNode;
}) {
  const { session } = useAuth();
  const { role } = useTeamRole();
  // "My funnel" appears for members who have a Launchpad funnel (their own build job, by row-level security).
  const [hasFunnel, setHasFunnel] = useState(false);
  const [pendingEnquiries, setPendingEnquiries] = useState(0);
  useEffect(() => {
    if (!session) return;
    myFunnelToken().then((token) => setHasFunnel(!!token)).catch(() => setHasFunnel(false));
    myFunnels().then((funnels) => myLeads(funnels.map((funnel) => funnel.id)).then((leads) => setPendingEnquiries(leads.filter((lead) => lead.status === 'pending' || lead.status === 'failed').length))).catch(() => setPendingEnquiries(0));
  }, [session?.user.id]);
  if (!session) return <LmsShell active={active} onNavigate={onNavigate}>{children}</LmsShell>;
  const toItem = (item: { key: string; label: string; icon: typeof LayoutDashboard; badge?: string | number }): DrawerItem => ({
    key: item.key,
    label: item.label,
    icon: item.icon,
    active: active === item.key,
    onClick: () => onNavigate(item.key as Route),
    badge: item.badge,
  });
  const visible = LEARNER_NAV.filter(
    (item) =>
      (item.key !== 'courses' || COURSES_ENABLED) &&
      (!['funnel', 'agents', 'integrations', 'templates', 'analytics'].includes(item.key) || hasFunnel),
  );
  const groups: SidebarGroup[] = [
    { label: 'Overview', items: visible.filter((item) => item.key === 'dashboard').map(toItem) },
    { items: visible.filter((item) => ['funnel', 'enquiries', 'analytics', 'agents', 'templates', 'integrations'].includes(item.key)).map((item) => toItem({ ...item, badge: item.key === 'enquiries' && pendingEnquiries > 0 ? pendingEnquiries : undefined })) },
    { label: COURSES_ENABLED ? 'Learn' : undefined, items: visible.filter((item) => ['courses', 'my-membership'].includes(item.key)).map(toItem) },
    ...(role ? [{ label: 'Team', items: [toItem({ key: 'studio', label: 'Studio', icon: UsersRound })] }] : []),
  ];
  return (
    <LmsShell active={active} onNavigate={onNavigate} wide hideNav headerMobileOnly drawerTitle="Menu" drawerGroups={groups}>
      <DashboardFrame groups={groups} onNavigate={onNavigate}>
        <InLearnerLayout.Provider value={true}>
          <div className="min-w-0">{children}</div>
        </InLearnerLayout.Provider>
      </DashboardFrame>
    </LmsShell>
  );
}

export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`font-label text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)] ${className}`}>
      {children}
    </p>
  );
}

export function PageTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h1 className={`font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px] ${className}`}>
      {children}
    </h1>
  );
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-[var(--pg-alt)] ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-[var(--pg-accent)] transition-[width] duration-500" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'dark' }) {
  const toneClass =
    tone === 'accent'
      ? 'bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]'
      : tone === 'dark'
        ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]'
        : 'bg-[var(--pg-alt)] text-[var(--pg-ink)]';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${toneClass}`}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = 'accent',
  type = 'button',
  disabled = false,
  busy = false,
  className = '',
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'accent' | 'dark' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  /** The button's name when it shows only an icon. */
  'aria-label'?: string;
  key?: React.Key;
}) {
  const variantClass =
    variant === 'accent'
      ? 'bg-[var(--pg-accent)] text-[var(--pg-accent-ink)] hover:opacity-90'
      : variant === 'dark'
        ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)] hover:opacity-90'
        : variant === 'danger'
          ? 'border border-[#B42318]/30 text-[#B42318] hover:bg-[#B42318]/5'
          : 'border border-[var(--pg-line)] text-[var(--pg-ink)] hover:bg-[var(--pg-alt)]';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14.5px] font-medium transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${className}`}
    >
      {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-[15px] text-[var(--pg-body)]">
      <LoaderCircle className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: React.ReactNode }) {
  const toneClass =
    tone === 'error'
      ? 'border-[#B42318]/25 bg-[#B42318]/5 text-[#7A1A12]'
      : tone === 'success'
        ? 'border-[#1D6A58]/25 bg-[#1D6A58]/5 text-[#14493D]'
        : 'border-[var(--pg-line)] bg-[var(--pg-alt)] text-[var(--pg-ink)]';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-[12px] border px-4 py-3 text-[14.5px] leading-[1.5] ${toneClass}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className={`${CARD} px-8 py-12 text-center`}>
      <h3 className="font-editorial text-[24px] font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-[460px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

const FIELD_INPUT =
  'w-full rounded-[10px] border border-[var(--pg-line)] bg-[color-mix(in_srgb,var(--pg-alt)_20%,var(--pg-card))] px-3.5 py-2.5 text-[15px] text-[var(--pg-ink)] outline-none transition placeholder:text-[var(--pg-body)]/60 focus:border-[var(--pg-accent)] focus:bg-[var(--pg-card)] focus:ring-2 focus:ring-[var(--pg-accent)]/20';

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  key?: React.Key;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13.5px] font-medium text-[var(--pg-ink)]">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[12.5px] text-[var(--pg-body)]">{hint}</span>}
      {error && <span className="mt-1 block text-[12.5px] text-[#B42318]">{error}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD_INPUT} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${FIELD_INPUT} leading-[1.55] ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${FIELD_INPUT} cursor-pointer ${props.className ?? ''}`} />;
}

/** Renders plain-text lesson notes: blank lines become paragraphs, lines starting with "- " become bullets. */
export function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className="space-y-4 text-[16.5px] leading-[1.7] text-[var(--pg-ink)]">
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
          return (
            <ul key={index} className="list-disc space-y-1.5 pl-5">
              {lines.map((line, i) => (
                <li key={i}>{line.trim().replace(/^[-*]\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}
