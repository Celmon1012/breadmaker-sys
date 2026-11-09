// Turns an application and its funnel brief into the funnel.json the site template builds from.
// Pure functions: no network, so the mapping can be reasoned about and tested on its own.

import { normalizePage } from './page.ts';

type Brief = Record<string, any>;
type Application = { name: string; email: string; phone?: string | null; company?: string | null };

/** "[price]" style gaps the brief writer left for a person to fill in. */
export function placeholdersIn(value: unknown): string[] {
  const found = JSON.stringify(value ?? {}).match(/\[[^\[\]"{}]{1,40}\]/g) ?? [];
  return [...new Set(found)];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
    .replace(/-+$/g, '');
}

/** A short, unique, URL-safe name for the site: the business name plus the start of the application id. */
export function siteSlug(application: Application & { id: string }): string {
  const base = slugify(application.company || application.name) || 'funnel';
  return `${base}-${application.id.replace(/-/g, '').slice(0, 4)}`;
}

export const SEGMENTS = ['ready', 'warming', 'early'] as const;
export type Segment = (typeof SEGMENTS)[number];

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * A scorecard the model wrote, made safe to build from: 1 to 4 categories, 3 to 10 questions of 2 to 4 options
 * worth 0 to 3 points, and three bands (ready, warming, early) that cover every score from 0. Returns null when
 * there is not enough to make a working quiz, so a bad reply never breaks the funnel; the page is built without it.
 */
export function normalizeScorecard(value: unknown): Record<string, any> | null {
  const raw = value as Record<string, any> | null;
  if (!raw || typeof raw !== 'object') return null;
  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .map((c: Brief, i: number) => ({ id: text(c?.id, 24).toLowerCase().replace(/[^a-z0-9-]+/g, '-') || `c${i + 1}`, name: text(c?.name, 60) }))
    .filter((c: { name: string }) => c.name)
    .slice(0, 4);
  if (categories.length < 1) return null;
  const known = new Set(categories.map((c: { id: string }) => c.id));
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((q: Brief, i: number) => {
      const options = (Array.isArray(q?.options) ? q.options : [])
        .map((o: Brief) => ({ label: text(o?.label, 140), points: Math.max(0, Math.min(3, Math.round(Number(o?.points) || 0))) }))
        .filter((o: { label: string }) => o.label)
        .slice(0, 4);
      const wanted = text(q?.category, 24).toLowerCase();
      return { id: `q${i + 1}`, category: known.has(wanted) ? wanted : categories[0].id, text: text(q?.text, 220), options };
    })
    .filter((q: { text: string; options: unknown[] }) => q.text && q.options.length >= 2)
    .slice(0, 10);
  if (questions.length < 3) return null;
  // Only categories that have at least one question are kept.
  const used = categories.filter((c: { id: string }) => questions.some((q: { category: string }) => q.category === c.id));
  const bands = SEGMENTS.map((id, i) => {
    const b = (Array.isArray(raw.bands) ? raw.bands : []).find((x: Brief) => x?.id === id) ?? {};
    const fallbackMin = [70, 40, 0][i];
    return {
      id,
      min: id === 'early' ? 0 : Math.max(1, Math.min(100, Math.round(Number(b.min) || fallbackMin))),
      title: text(b.title, 90),
      summary: text(b.summary, 400),
      next_step: text(b.next_step, 300),
      cta_label: text(b.cta_label, 40),
    };
  });
  // ready above warming above early, whatever the model chose.
  if (bands[0].min <= bands[1].min) { bands[0].min = 70; bands[1].min = 40; }
  if (bands.some((b) => !b.title)) return null;
  return { title: text(raw.title, 100) || 'Scorecard', intro: text(raw.intro, 300), categories: used, questions, bands };
}

/** The segment a percentage score falls in. */
export function segmentFor(scorecard: Record<string, any>, percent: number): Segment {
  const band = [...scorecard.bands].sort((a: any, b: any) => b.min - a.min).find((b: any) => percent >= b.min);
  return (band?.id ?? 'early') as Segment;
}

export function buildFunnel(brief: Brief, application: Application, options: { indexable: boolean; leadEndpoint?: string; page?: unknown }) {
  const offer = brief.offer ?? {};
  const cta = brief.cta ?? {};
  const type = ['enquiry', 'booking', 'payment'].includes(cta.type) ? cta.type : 'enquiry';
  return {
    brand: { name: (application.company || application.name || '').trim(), tagline: '' },
    theme: { accent: '#1D6A58' },
    indexable: options.indexable,
    owner: { email: application.email, phone: application.phone ?? '', whatsapp: application.phone ?? '' },
    hero: { headline: offer.headline ?? '', subheadline: offer.subheadline ?? '', cta_label: cta.label ?? 'Get in touch' },
    cta: { type, label: cta.label ?? 'Get in touch', url: '' },
    sections: (Array.isArray(brief.sections) ? brief.sections : []).map((section: Brief) => ({
      id: String(section.id ?? ''),
      title: section.title ?? '',
      body: section.body ?? '',
      bullets: Array.isArray(section.bullets) ? section.bullets : [],
    })),
    faq: (Array.isArray(brief.faq) ? brief.faq : []).map((item: Brief) => ({ q: item.q ?? '', a: item.a ?? '' })),
    // The page as blocks, when the member has opened the page editor. The site template builds from it instead of the sections above.
    // A scorecard funnel keeps its quiz, so it ignores the page.
    page: brief?.scorecard ? null : normalizePage(options.page),
    // A scored quiz: the visitor answers, leaves their details, and sees a result for their segment.
    scorecard: normalizeScorecard(brief.scorecard),
    form: {
      title: 'Tell us what you need',
      button: 'Send',
      success: 'Thanks. We will reply shortly.',
      consent: 'We use your details only to reply to your enquiry.',
      // Explicit, unticked by default: only a ticked box lets Kumoda message the person on WhatsApp.
      whatsapp_label: 'Yes, you may message me on WhatsApp about my enquiry.',
      endpoint: options.leadEndpoint ?? '',
    },
  };
}
