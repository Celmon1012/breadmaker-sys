import React from 'react';
import { Priced, joinPrice, splitPrice } from '../../lib/currency';
import { Field, TextInput } from './lms-ui';

/** Whole naira / dollars in the box, minor units (kobo / cents) in the database. Empty means no price in that currency. */
const toBox = (minor: number | null) => (minor && minor > 0 ? String(minor / 100) : '');
const fromBox = (value: string) => {
  const amount = Math.round(Number(value) * 100);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

/**
 * Two price boxes, one per currency, over a price stored as a main amount plus the other-currency amount.
 * Naira is the main price whenever it is set, so an existing naira price stays exactly as it was.
 */
export default function DualPrice({
  price,
  onChange,
  disabled = false,
  hint,
}: {
  price: Priced;
  onChange: (next: { priceMinor: number; currency: 'NGN' | 'USD'; altPriceMinor: number | null }) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { ngn, usd } = splitPrice(price);
  return (
    <>
      <Field label="Price in naira (₦)" hint={hint}>
        <TextInput
          type="number"
          min={0}
          step="0.01"
          value={toBox(ngn)}
          placeholder="Not set"
          onChange={(e) => onChange(joinPrice(fromBox(e.target.value), usd))}
          disabled={disabled}
        />
      </Field>
      <Field label="Price in dollars ($)" hint="Shown to visitors who switch to USD. Leave empty to show the naira price to everyone.">
        <TextInput
          type="number"
          min={0}
          step="0.01"
          value={toBox(usd)}
          placeholder="Not set"
          onChange={(e) => onChange(joinPrice(ngn, fromBox(e.target.value)))}
          disabled={disabled}
        />
      </Field>
    </>
  );
}
