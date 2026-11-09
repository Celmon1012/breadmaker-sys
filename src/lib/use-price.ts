import { Priced, resolvePrice, useCurrency } from './currency';
import { formatPrice } from './lms';

/**
 * Prices for the currency the visitor picked in the switcher. `text` is the display string
 * (null when not on sale, "Free" for free); `resolve` gives the amount and currency to compute with.
 */
export function usePrice() {
  const { currency } = useCurrency();
  const resolve = (price: Priced) => resolvePrice(price, currency);
  const text = (price: Priced) => {
    const shown = resolvePrice(price, currency);
    return formatPrice(shown.priceMinor, shown.currency);
  };
  return { currency, resolve, text };
}
