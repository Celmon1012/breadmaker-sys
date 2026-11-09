import { supabase } from './supabase';
import { startCheckout } from './payments';

/**
 * Kits: the Academy course for one system, bought on its own. A kit only appears here once
 * the team has published its course and set a price in the Studio; until then the system
 * shows "Tell me when it is ready". Programs (Launchpad, Foundry) include their kits.
 */

export interface KitOffer {
  systemId: string;
  slug: string;
  title: string;
  priceMinor: number | null;
  currency: string;
  altPriceMinor: number | null;
  lessonCount: number;
  previewCount: number;
}

export async function listKitOffers(): Promise<KitOffer[]> {
  const { data, error } = await supabase.rpc('kit_offers');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    systemId: row.system_id,
    slug: row.slug,
    title: row.title,
    priceMinor: row.price_minor,
    currency: String(row.currency ?? 'NGN').toUpperCase(),
    altPriceMinor: row.alt_price_minor ?? null,
    lessonCount: row.lesson_count ?? 0,
    previewCount: row.preview_count ?? 0,
  }));
}

/** Starts the Flutterwave payment for a kit and returns the link to open. */
export async function startKitCheckout(systemId: string, email: string, name: string): Promise<string> {
  const result = await startCheckout({ program: 'kit', tier: systemId, email, name });
  return result.link;
}
