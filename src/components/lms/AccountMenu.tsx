import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, CreditCard, Gift, LifeBuoy, LogOut, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getMyMembership } from '../../lib/hub';
import { listMyTickets } from '../../lib/support';
import Avatar, { useMyAvatar } from './Avatar';

/**
 * The bottom of the dashboard sidebar: the member's photo and name (opens an account card with sign out)
 * and a notification bell. Notifications are built from what the member already has: replies the team
 * left on their support tickets, and a Prestige month that is about to end.
 */

interface Notice {
  id: string;
  icon: typeof LifeBuoy;
  title: string;
  body: string;
  route: Route;
}

const SEEN_KEY = 'bm-notifications-seen';

const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

const writeSeen = (ids: string[]) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-100)));
  } catch {
    /* the bell just shows them again next visit */
  }
};

const dateOnly = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function useNotices(userId: string | undefined) {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    if (!userId) {
      setNotices([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const found: Notice[] = [];
      try {
        const tickets = await listMyTickets(userId);
        for (const ticket of tickets) {
          if (!ticket.teamNote.trim()) continue;
          found.push({
            id: `ticket:${ticket.id}:${ticket.teamNote.length}:${ticket.status}`,
            icon: LifeBuoy,
            title: 'The team replied to your ticket',
            body: ticket.subject || 'Support ticket',
            route: 'support',
          });
        }
      } catch {
        /* no support tickets table yet, or signed out: nothing to show */
      }
      try {
        const membership = await getMyMembership();
        if (membership?.active) {
          const daysLeft = Math.ceil((new Date(membership.periodEnd).getTime() - Date.now()) / 86_400_000);
          if (daysLeft <= 7) {
            found.push({
              id: `prestige:${membership.periodEnd}`,
              icon: Sparkles,
              title: daysLeft <= 0 ? 'Your Prestige month ends today' : `Your Prestige month ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
              body: `Renew before ${dateOnly(membership.periodEnd)} to keep your access.`,
              route: 'billing',
            });
          }
        }
      } catch {
        /* membership not set up: nothing to show */
      }
      if (!cancelled) setNotices(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return notices;
}

export default function SidebarAccount({
  role,
  onNavigate,
  onPick,
  collapsed = false,
}: {
  /** the team role, when the member is on the team */
  role: string | null;
  onNavigate: (route: Route) => void;
  /** called before something runs, so the mobile drawer can close itself */
  onPick?: () => void;
  /** minimised sidebar: photo and bell only, stacked */
  collapsed?: boolean;
}) {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;
  const email = session?.user.email ?? '';
  const name =
    String(session?.user.user_metadata?.full_name ?? '').trim() ||
    [session?.user.user_metadata?.first_name, session?.user.user_metadata?.last_name].filter(Boolean).join(' ').trim() ||
    email.replace(/@.*/, '');
  const photo = useMyAvatar(userId);
  const notices = useNotices(userId);

  const [modal, setModal] = useState(false);
  const [seen, setSeen] = useState<string[]>(readSeen);
  const menuBox = useRef<HTMLDivElement>(null);
  const unread = notices.filter((notice) => !seen.includes(notice.id));

  // Opening the menu shows the notifications, and marks them as seen.
  useEffect(() => {
    if (!modal || unread.length === 0) return;
    const next = [...seen, ...unread.map((notice) => notice.id)];
    setSeen(next);
    writeSeen(next);
  }, [modal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!modal) return;
    const onDown = (event: MouseEvent) => !menuBox.current?.contains(event.target as Node) && setModal(false);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setModal(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [modal]);

  const goTo = useCallback(
    (route: Route) => {
      setModal(false);
      onPick?.();
      onNavigate(route);
    },
    [onNavigate, onPick],
  );

  const signOutAndLeave = async () => {
    setModal(false);
    onPick?.();
    await signOut();
    onNavigate('home');
  };

  return (
    <div ref={menuBox} className="relative">
      <button
        onClick={() => setModal((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={modal}
        aria-label={collapsed ? `Account menu, ${name}` : undefined}
        title={collapsed ? name : undefined}
        className={`flex w-full min-w-0 items-center rounded-[14px] text-left transition-colors hover:bg-[var(--pg-alt)]/60 cursor-pointer ${collapsed ? 'justify-center p-1' : 'gap-3 p-3'}`}
      >
        <span className="relative shrink-0">
          <Avatar url={photo} name={name || email} size={collapsed ? 36 : 40} />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--pg-accent)] px-1 text-[10px] font-semibold leading-none text-[var(--pg-accent-ink)]" aria-label={`${unread.length} new notifications`}>
              {unread.length}
            </span>
          )}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-[1.2]">{name}</span>
              <span className="block truncate text-[13px] leading-[1.3] text-[var(--pg-body)]">{email}</span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--pg-alt)] text-[var(--pg-body)]" aria-hidden="true">
              <ChevronsUpDown className="h-4 w-4" />
            </span>
          </>
        )}
      </button>

      {modal && (
        <div role="menu" className={`absolute bottom-full z-50 mb-2 w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[16px] border border-[var(--pg-line)] bg-[var(--pg-card)] py-1 ${collapsed ? 'left-0' : 'left-0 right-0 w-auto'}`}>
          <div className="border-b border-[var(--pg-line-soft)] px-4 py-3">
            <p className="truncate text-[15px] font-semibold">{name}</p>
            <p className="mt-0.5 truncate text-[13px] text-[var(--pg-body)]">{email}</p>
          </div>
          {notices.length > 0 && (
            <div className="border-b border-[var(--pg-line-soft)] py-1">
              <p className="px-4 pb-1 pt-2 font-label text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-body)]">Notifications</p>
              {notices.map((notice) => (
                <button key={notice.id} onClick={() => goTo(notice.route)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--pg-alt)] cursor-pointer">
                  <notice.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pg-accent)]" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium leading-[1.3]">{notice.title}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-[var(--pg-body)]">{notice.body}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {[
            { label: 'Settings', icon: UserRound, route: 'profile' as Route },
            { label: 'Billing', icon: CreditCard, route: 'billing' as Route },
            { label: 'Referrals', icon: Gift, route: 'referrals' as Route },
            { label: 'Support', icon: LifeBuoy, route: 'support' as Route },
            ...(role ? [{ label: 'Studio', icon: ShieldCheck, route: 'studio' as Route }] : []),
          ].map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => goTo(item.route)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14.5px] transition-colors hover:bg-[var(--pg-alt)] cursor-pointer"
            >
              <item.icon className="h-4 w-4 text-[var(--pg-body)]" aria-hidden="true" /> {item.label}
            </button>
          ))}
          <div className="mt-1 border-t border-[var(--pg-line-soft)] pt-1">
            <button
              role="menuitem"
              onClick={() => void signOutAndLeave()}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14.5px] font-medium text-[#B42318] transition-colors hover:bg-[var(--pg-alt)] cursor-pointer"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
