import React from 'react';
import { CURRENCIES, useCurrency } from '../lib/currency';

/** NGN / USD toggle for the site and Academy headers. The choice is remembered in this browser. */
export default function CurrencySwitch({ className = '' }: { className?: string }) {
  const { currency, setCurrency } = useCurrency();
  return (
    <div role="group" aria-label="Currency" className={`inline-flex rounded-full border border-[var(--pg-line)] p-0.5 text-[13px] font-medium ${className}`}>
      {CURRENCIES.map((item) => (
        <button
          key={item}
          onClick={() => setCurrency(item)}
          aria-pressed={currency === item}
          className={`rounded-full px-3 py-1.5 transition-colors cursor-pointer ${
            currency === item ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'text-[var(--pg-ink)] hover:bg-[var(--pg-alt)]'
          }`}
        >
          {item === 'NGN' ? '₦ NGN' : '$ USD'}
        </button>
      ))}
    </div>
  );
}
