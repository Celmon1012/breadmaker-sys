import React, { useEffect, useState } from 'react';
import { Route } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { errorMessage, formatPrice } from '../../lib/lms';
import { HubOffer, MyMembership, getHubOffer, getMyMembership, hubPayable, startHubCheckout } from '../../lib/hub';
import { usePrice } from '../../lib/use-price';
import { Button, CARD, Eyebrow, Notice } from './lms-ui';

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Breadmaker Hub join / renew card. Hidden until the team switches the Hub on in Studio.
 * The amount shown is for display only: checkout reads the price from the database.
 */
export default function HubCard({ onNavigate, className = '' }: { onNavigate: (route: Route) => void; className?: string }) {
  const { user } = useAuth();
  const { resolve } = usePrice();
  const [offer, setOffer] = useState<HubOffer | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHubOffer()
      .then((value) => !cancelled && setOffer(value))
      .catch(() => undefined);
    if (user) {
      getMyMembership()
        .then((value) => !cancelled && setMembership(value))
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Someone whose time is running can still renew; with the Hub switched off, only an active member sees the card.
  if (!offer && !membership?.active) return null;

  const active = membership?.active === true;
  // A plan of 100 years is a one-time payment: nothing to renew.
  const oneTime = !!offer && offer.periodDays >= 3650;
  // The amount in the currency picked in the switcher; the discount takes the same percentage off either.
  const shown = offer ? resolve({ priceMinor: offer.priceMinor, currency: offer.currency, altPriceMinor: offer.altPriceMinor }) : null;
  const shownMinor = shown?.priceMinor ?? 0;
  const payable = offer ? hubPayable(shownMinor, offer.discountPct) : 0;

  const pay = async () => {
    if (!user?.email) {
      onNavigate('signin');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await startHubCheckout(user.email, String(user.user_metadata?.full_name ?? '')));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <aside className={`${CARD} p-7 lg:p-9 ${className}`}>
      <Eyebrow>Breadmaker Prestige</Eyebrow>
      <p className="mt-3 font-editorial text-[26px] font-semibold leading-[1.15] text-[var(--pg-ink)]">
        {active ? 'You are in Prestige.' : 'Every kit and course, one month at a time.'}
      </p>
      <p className="mt-3 max-w-[560px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
        {active && membership
          ? oneTime
            ? 'You have lifetime access. Every kit and course is open to you.'
            : `Your membership runs to ${formatDate(membership.periodEnd)}. Renew now and the new month is added to the end of it.`
          : offer?.description || 'Join Breadmaker Prestige. Programs are joined separately.'}
      </p>
      {offer && shown && (
        <p className="mt-4 text-[15px] text-[var(--pg-ink)]">
          <span className="text-[22px] font-semibold">{formatPrice(payable, shown.currency)}</span>
          {offer.discountPct > 0 && (
            <span className="ml-2 text-[var(--pg-body)]">
              <s>{formatPrice(shownMinor, shown.currency)}</s>
              {offer.discountEndsAt ? `, ${offer.discountPct}% off until ${formatDate(offer.discountEndsAt)}` : ''}
            </span>
          )}
          <span className="ml-2 text-[var(--pg-body)]">{oneTime ? 'one-time' : `for ${offer.periodDays} days`}</span>
        </p>
      )}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {offer && !(oneTime && active) && (
        <div className="mt-6">
          <Button busy={busy} onClick={() => void pay()}>
            {!user ? 'Sign in to join' : active ? 'Renew for another month' : membership ? 'Rejoin Prestige' : 'Join Prestige'}
          </Button>
        </div>
      )}
    </aside>
  );
}
