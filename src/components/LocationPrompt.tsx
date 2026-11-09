import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Globe } from 'lucide-react';
import { COUNTRIES } from '../lib/countries';
import {
  CURRENCIES,
  Currency,
  confirmLocation,
  currencyForCountry,
  dismissLocationPrompt,
  getCurrency,
  getDetectedCountry,
  shouldAskLocation,
} from '../lib/currency';
import { BREADMAKER_THEME, themeStyle } from './program-ui';

/** Country name for a two-letter code, matched to the names in the countries list where possible. */
function countryName(code: string | null): string {
  if (!code) return '';
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase());
    if (name && COUNTRIES.includes(name)) return name;
  } catch {
    /* older browsers */
  }
  return code.toUpperCase() === 'NG' ? 'Nigeria' : '';
}

const label = (currency: Currency) => (currency === 'NGN' ? '₦ Naira (NGN)' : '$ US dollars (USD)');

/**
 * First visit only: asks where the visitor is browsing from, and sets their country and price currency.
 * It starts from the country worked out from their IP address, and one tap on Continue accepts it.
 */
export default function LocationPrompt() {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState('');
  const [currency, setCurrencyChoice] = useState<Currency>(getCurrency());
  const touched = useRef(false);
  const picked = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Wait a moment after the page loads so it does not cover the first paint.
  useEffect(() => {
    if (!shouldAskLocation()) return;
    const timer = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  // The IP lookup can land after the prompt opens: follow it until the visitor touches something.
  useEffect(() => {
    if (!open) return;
    let tries = 0;
    const apply = () => {
      if (touched.current) return;
      const detected = countryName(getDetectedCountry());
      if (detected) {
        setCountry(detected);
        if (!picked.current) setCurrencyChoice(currencyForCountry(getDetectedCountry()));
      } else if (!country && getCurrency() === 'NGN') {
        setCountry('Nigeria');
      }
    };
    apply();
    const timer = window.setInterval(() => {
      apply();
      tries += 1;
      if (tries >= 8) window.clearInterval(timer);
    }, 500);
    selectRef.current?.focus();
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') later();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const later = () => {
    dismissLocationPrompt();
    setOpen(false);
  };

  const confirm = () => {
    confirmLocation(country, currency);
    setOpen(false);
  };

  const onCountry = (event: React.ChangeEvent<HTMLSelectElement>) => {
    touched.current = true;
    const next = event.target.value;
    setCountry(next);
    if (!picked.current && next) setCurrencyChoice(next === 'Nigeria' ? 'NGN' : 'USD');
  };

  const onCurrency = (next: Currency) => {
    touched.current = true;
    picked.current = true;
    setCurrencyChoice(next);
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center print:hidden" style={themeStyle(BREADMAKER_THEME)}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40"
            onClick={later}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-title"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-[460px] rounded-[17px] border border-[var(--pg-line-soft)] bg-white p-7 font-inter text-[var(--pg-ink)] sm:p-8"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--pg-alt)] text-[var(--pg-accent)]">
              <Globe className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="location-title" className="mt-5 font-editorial text-[26px] font-semibold leading-[1.15] tracking-[-0.01em]">
              Where are you visiting from?
            </h2>
            <p className="mt-2 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
              We use it to show prices in your currency. You can change it any time from your profile.
            </p>

            <label htmlFor="location-country" className="mt-6 block text-[14.5px] font-medium">
              Country
            </label>
            <select
              id="location-country"
              ref={selectRef}
              value={country}
              onChange={onCountry}
              className="mt-2 w-full rounded-[10px] border border-[var(--pg-line)] bg-white px-4 py-3 text-[16px]"
            >
              <option value="">Choose your country</option>
              {country && !COUNTRIES.includes(country) && <option value={country}>{country}</option>}
              {COUNTRIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <p className="mt-5 text-[14.5px] font-medium">Show prices in</p>
            <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Currency">
              {CURRENCIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onCurrency(item)}
                  aria-pressed={currency === item}
                  className={`rounded-[10px] border px-3 py-3 text-[14.5px] font-medium transition-colors cursor-pointer ${
                    currency === item
                      ? 'border-[var(--pg-ink)] bg-[var(--pg-ink)] text-[var(--pg-bg)]'
                      : 'border-[var(--pg-line)] hover:bg-[var(--pg-alt)]'
                  }`}
                >
                  {label(item)}
                </button>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
              <button type="button" onClick={later} className="text-[15px] font-semibold text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer">
                Not now
              </button>
              <button
                type="button"
                onClick={confirm}
                className="rounded-full bg-[var(--pg-accent)] px-7 py-3 text-[15px] font-medium text-[var(--pg-accent-ink)] transition-opacity hover:opacity-90 cursor-pointer"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
