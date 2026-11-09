import { useSyncExternalStore } from 'react';

/**
 * The currency a visitor wants to see prices in, and how a price with two amounts resolves.
 *
 * Every price is stored as a main amount and currency plus an optional amount in the other
 * currency (alt). Pick NGN or USD with the switcher; a price with no amount in the chosen
 * currency shows in its main currency instead. Checkout sends the same choice to the server,
 * which reads the real amount from the database.
 *
 * Which currency a visitor sees: a choice they made themselves wins (setCurrency saves it). Until then
 * it follows where they are browsing from, worked out once from their IP address and cached, with the
 * time zone and language as the quick first guess and the fallback.
 */

export type Currency = 'NGN' | 'USD';
export const CURRENCIES: Currency[] = ['NGN', 'USD'];

const KEY = 'bm-currency';
const GEO_KEY = 'bm-geo';
const GEO_URL = 'https://api.country.is/';
const GEO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Naira for Nigeria, dollars everywhere else. */
export const currencyForCountry = (country: string | null | undefined): Currency => (country?.toUpperCase() === 'NG' ? 'NGN' : 'USD');

/** The two-letter country code worked out from the visitor's IP address, once cached, or null. */
export function getDetectedCountry(): string | null {
  try {
    const raw = window.localStorage.getItem(GEO_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { country?: string; at?: number };
    if (!saved.country || !saved.at || Date.now() - saved.at > GEO_MAX_AGE_MS) return null;
    return saved.country;
  } catch {
    return null;
  }
}

/** First visit: naira for visitors in Nigeria (by time zone or language), dollars for everyone else. */
function guess(): Currency {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === 'Africa/Lagos' || /-NG$/i.test(navigator.language)) return 'NGN';
  } catch {
    /* fall through */
  }
  return 'USD';
}

const LOCATION_KEY = 'bm-location';
const DISMISS_DAYS = 7;

export interface ConfirmedLocation {
  country: string;
  currency: Currency;
}

/** The country and currency the visitor confirmed in the first-visit prompt, or null. */
export function getConfirmedLocation(): ConfirmedLocation | null {
  try {
    const raw = window.localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { country?: string; currency?: string; dismissedAt?: number };
    if (!saved.country || (saved.currency !== 'NGN' && saved.currency !== 'USD')) return null;
    return { country: saved.country, currency: saved.currency };
  } catch {
    return null;
  }
}

/** Whether to show the first-visit prompt: not confirmed, and not dismissed in the last week. */
export function shouldAskLocation(): boolean {
  try {
    const raw = window.localStorage.getItem(LOCATION_KEY);
    if (!raw) return true;
    const saved = JSON.parse(raw) as { country?: string; dismissedAt?: number };
    if (saved.country) return false;
    return !saved.dismissedAt || Date.now() - saved.dismissedAt > DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Saves the visitor's confirmed country and currency, and switches prices to that currency. */
export function confirmLocation(country: string, next: Currency) {
  try {
    window.localStorage.setItem(LOCATION_KEY, JSON.stringify({ country, currency: next }));
  } catch {
    /* not remembered */
  }
  setCurrency(next);
}

/** "Not now": ask again in a week, and keep the currency guessed from their location. */
export function dismissLocationPrompt() {
  try {
    window.localStorage.setItem(LOCATION_KEY, JSON.stringify({ dismissedAt: Date.now() }));
  } catch {
    /* ask again next visit */
  }
}

/** True when the visitor picked a currency themselves, so location must not override it. */
function hasChosen(): boolean {
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved === 'NGN' || saved === 'USD';
  } catch {
    return false;
  }
}

function read(): Currency {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'NGN' || saved === 'USD') return saved;
  } catch {
    /* private mode */
  }
  const country = getDetectedCountry();
  return country ? currencyForCountry(country) : guess();
}

let current: Currency | null = null;
const listeners = new Set<() => void>();

/** The chosen currency, readable outside React (for example when starting a checkout). */
export function getCurrency(): Currency {
  if (current === null) current = read();
  return current;
}

export function setCurrency(next: Currency) {
  current = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* the choice just will not be remembered */
  }
  listeners.forEach((listener) => listener());
}

/**
 * Looks the visitor's country up from their IP address (one small request, cached for 30 days) and,
 * if they have not chosen a currency, switches to the matching one. Fails quietly to the time zone guess.
 */
function detectLocation() {
  if (typeof window === 'undefined' || hasChosen() || getDetectedCountry()) return;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  fetch(GEO_URL, { signal: controller.signal })
    .then((response) => (response.ok ? response.json() : null))
    .then((data: { country?: string } | null) => {
      const country = data?.country;
      if (!country || !/^[A-Za-z]{2}$/.test(country)) return;
      try {
        window.localStorage.setItem(GEO_KEY, JSON.stringify({ country: country.toUpperCase(), at: Date.now() }));
      } catch {
        /* not remembered */
      }
      if (hasChosen()) return;
      const next = currencyForCountry(country);
      if (next !== current) {
        current = next;
        listeners.forEach((listener) => listener());
      }
    })
    .catch(() => {
      /* offline, blocked or slow: keep the time zone guess */
    })
    .finally(() => window.clearTimeout(timer));
}

if (typeof window !== 'undefined') detectLocation();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCurrency() {
  const currency = useSyncExternalStore(subscribe, getCurrency, () => 'NGN' as Currency);
  return { currency, setCurrency };
}

/** A price as stored: main amount and currency, plus the amount in the other currency. */
export interface Priced {
  priceMinor: number | null;
  currency: string;
  altPriceMinor?: number | null;
}

/**
 * The amount and currency to show for a price. null stays null (not on sale) and 0 stays 0 (free).
 * With no amount in the wanted currency, the main amount is returned in its own currency.
 */
export function resolvePrice(price: Priced, wanted: Currency): { priceMinor: number | null; currency: string } {
  const main = String(price.currency || 'NGN').toUpperCase();
  if (price.priceMinor === null || price.priceMinor === 0) return { priceMinor: price.priceMinor, currency: main };
  if (main === wanted) return { priceMinor: price.priceMinor, currency: main };
  if (price.altPriceMinor && price.altPriceMinor > 0) return { priceMinor: price.altPriceMinor, currency: wanted };
  return { priceMinor: price.priceMinor, currency: main };
}

/** Splits a stored price into one amount per currency, for the two Studio price boxes. */
export function splitPrice(price: Priced): { ngn: number | null; usd: number | null } {
  const main = String(price.currency || 'NGN').toUpperCase();
  const mainAmount = price.priceMinor && price.priceMinor > 0 ? price.priceMinor : null;
  const alt = price.altPriceMinor && price.altPriceMinor > 0 ? price.altPriceMinor : null;
  return main === 'USD' ? { ngn: alt, usd: mainAmount } : { ngn: mainAmount, usd: alt };
}

/** The reverse: naira is the main price when there is one, so existing naira prices stay as they are. */
export function joinPrice(ngn: number | null, usd: number | null): { priceMinor: number; currency: 'NGN' | 'USD'; altPriceMinor: number | null } {
  if (ngn && ngn > 0) return { priceMinor: ngn, currency: 'NGN', altPriceMinor: usd && usd > 0 ? usd : null };
  if (usd && usd > 0) return { priceMinor: usd, currency: 'USD', altPriceMinor: null };
  return { priceMinor: 0, currency: 'NGN', altPriceMinor: null };
}
