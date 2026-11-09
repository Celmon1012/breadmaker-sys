// The funnel page as blocks, the shape the Puck editor in the Hub reads and writes.
//
//   { root: { props: { accent, font, radius, ... } }, content: [ { type, props: { id, ... } } ] }
//
// Everything that comes from outside (the editor, or the model when a member chats) goes through normalizePage
// before it is saved or built. It is not a content filter: members can use every block and every design choice. It only
// keeps the page well-formed: known block types and props, choices from their lists, colours as hex, links and media
// addresses that are https (or an anchor, mailto or tel for links), and at most one lead form, because the form's
// id and script are unique on a page. Pure functions: no network.

type Brief = Record<string, any>;

export const BLOCK_TYPES = ['Hero', 'Section', 'Features', 'Steps', 'Testimonials', 'Stats', 'FAQ', 'Image', 'Video', 'Embed', 'Code', 'CallToAction', 'Spacer', 'Enquiry'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface PageBlock {
  type: BlockType;
  props: Record<string, string> & { id: string };
}
export interface PageData {
  root: { props: Record<string, string> };
  content: PageBlock[];
}

/** How one prop is cleaned. */
type Spec = {
  max: number;
  oneOf?: readonly string[];
  /** A https address (media). */
  url?: boolean;
  /** A link: https, an #anchor, mailto: or tel:. */
  link?: boolean;
  /** A colour as #rgb or #rrggbb, or empty for "the default". */
  hex?: boolean;
  /** A whole number in a range, kept as a string. */
  num?: [number, number];
  /** Rows of "a | b | c" text, one row per line. */
  lines?: { count: number; each: number };
};

const TONES = ['plain', 'alt', 'dark', 'accent'] as const;
const SPACES = ['compact', 'normal', 'roomy'] as const;
const YESNO = ['yes', 'no'] as const;

/** Props every block has: its own background and text colour, and how much room it takes. */
const COMMON: Record<string, Spec> = {
  bg: { max: 12, hex: true },
  ink: { max: 12, hex: true },
  space: { max: 8, oneOf: SPACES },
};
const COMMON_DEFAULTS: Record<string, string> = { bg: '', ink: '', space: 'normal' };

const SPECS: Record<BlockType, Record<string, Spec>> = {
  Hero: {
    eyebrow: { max: 120 },
    headline: { max: 400 },
    subheadline: { max: 1200 },
    buttonLabel: { max: 80 },
    buttonLink: { max: 600, link: true },
    secondLabel: { max: 80 },
    secondLink: { max: 600, link: true },
    image: { max: 600, url: true },
    imageAlt: { max: 200 },
    align: { max: 6, oneOf: ['left', 'center'] },
    tone: { max: 6, oneOf: TONES },
  },
  Section: {
    title: { max: 400 },
    body: { max: 8000 },
    bullets: { max: 6000, lines: { count: 30, each: 400 } },
    image: { max: 600, url: true },
    imageAlt: { max: 200 },
    imageSide: { max: 5, oneOf: ['right', 'left'] },
    align: { max: 6, oneOf: ['left', 'center'] },
    tone: { max: 6, oneOf: TONES },
  },
  Features: {
    title: { max: 400 },
    intro: { max: 1200 },
    items: { max: 12000, lines: { count: 24, each: 900 } },
    columns: { max: 1, oneOf: ['2', '3', '4'] },
    tone: { max: 6, oneOf: TONES },
  },
  Steps: {
    title: { max: 400 },
    intro: { max: 1200 },
    items: { max: 12000, lines: { count: 20, each: 900 } },
    tone: { max: 6, oneOf: TONES },
  },
  Testimonials: {
    title: { max: 400 },
    items: { max: 12000, lines: { count: 12, each: 1200 } },
    tone: { max: 6, oneOf: TONES },
  },
  Stats: {
    title: { max: 400 },
    items: { max: 4000, lines: { count: 8, each: 200 } },
    tone: { max: 6, oneOf: TONES },
  },
  FAQ: {
    title: { max: 400 },
    items: { max: 24000, lines: { count: 40, each: 1600 } },
    tone: { max: 6, oneOf: TONES },
  },
  Image: {
    image: { max: 600, url: true },
    imageAlt: { max: 200 },
    caption: { max: 400 },
    link: { max: 600, link: true },
    width: { max: 6, oneOf: ['narrow', 'wide', 'full'] },
    tone: { max: 6, oneOf: TONES },
  },
  Video: {
    url: { max: 600, url: true },
    title: { max: 200 },
    tone: { max: 6, oneOf: TONES },
  },
  Embed: {
    url: { max: 600, url: true },
    title: { max: 200 },
    height: { max: 4, num: [100, 1600] },
    tone: { max: 6, oneOf: TONES },
  },
  Code: {
    html: { max: 40000 },
    title: { max: 200 },
    height: { max: 4, num: [60, 1600] },
    tone: { max: 6, oneOf: TONES },
  },
  CallToAction: {
    title: { max: 400 },
    text: { max: 1200 },
    buttonLabel: { max: 80 },
    buttonLink: { max: 600, link: true },
    tone: { max: 6, oneOf: TONES },
  },
  Spacer: {
    height: { max: 3, num: [8, 400] },
    tone: { max: 6, oneOf: TONES },
  },
  Enquiry: {
    title: { max: 400 },
    intro: { max: 1200 },
    button: { max: 80 },
    success: { max: 400 },
    showPhone: { max: 3, oneOf: YESNO },
    showMessage: { max: 3, oneOf: YESNO },
    tone: { max: 6, oneOf: TONES },
  },
};

const DEFAULTS: Record<BlockType, Record<string, string>> = {
  Hero: { eyebrow: '', headline: '', subheadline: '', buttonLabel: 'Get in touch', buttonLink: '', secondLabel: '', secondLink: '', image: '', imageAlt: '', align: 'left', tone: 'plain' },
  Section: { title: '', body: '', bullets: '', image: '', imageAlt: '', imageSide: 'right', align: 'left', tone: 'plain' },
  Features: { title: '', intro: '', items: '', columns: '3', tone: 'alt' },
  Steps: { title: '', intro: '', items: '', tone: 'plain' },
  Testimonials: { title: '', items: '', tone: 'alt' },
  Stats: { title: '', items: '', tone: 'dark' },
  FAQ: { title: 'Questions', items: '', tone: 'plain' },
  Image: { image: '', imageAlt: '', caption: '', link: '', width: 'wide', tone: 'plain' },
  Video: { url: '', title: '', tone: 'plain' },
  Embed: { url: '', title: '', height: '600', tone: 'plain' },
  Code: { html: '', title: '', height: '300', tone: 'plain' },
  CallToAction: { title: '', text: '', buttonLabel: 'Get in touch', buttonLink: '', tone: 'accent' },
  Spacer: { height: '48', tone: 'plain' },
  Enquiry: { title: 'Tell us what you need', intro: '', button: 'Send', success: 'Thanks. We will reply shortly.', showPhone: 'yes', showMessage: 'yes', tone: 'alt' },
};

/** The page-wide look. */
export const ACCENT_PRESETS: Record<string, string> = { green: '#1D6A58', blue: '#1F5FBF', terracotta: '#B5472B', purple: '#6B3FA0', ink: '#1C1B16', gold: '#B8860B', rose: '#BE3455' };
const ROOT_SPECS: Record<string, Spec> = {
  accent: { max: 12, hex: true },
  bg: { max: 12, hex: true },
  ink: { max: 12, hex: true },
  font: { max: 8, oneOf: ['sans', 'serif', 'rounded', 'mono'] },
  radius: { max: 6, oneOf: ['square', 'soft', 'round'] },
  headerButton: { max: 3, oneOf: YESNO },
  seoTitle: { max: 160 },
  seoDescription: { max: 400 },
};
const ROOT_DEFAULTS: Record<string, string> = { accent: '#1D6A58', bg: '', ink: '', font: 'sans', radius: 'soft', headerButton: 'yes', seoTitle: '', seoDescription: '' };

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim().slice(0, max) : '');

function clean(value: unknown, spec: Spec, fallback: string): string {
  // Text edited as a number or a choice arrives as a string; a number typed into a field may arrive as a number.
  const raw = text(typeof value === 'number' ? String(value) : value, spec.max);
  if (spec.oneOf) return spec.oneOf.includes(raw) ? raw : fallback;
  if (spec.hex) {
    const named = ACCENT_PRESETS[raw.toLowerCase()];
    if (named) return named;
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : '';
  }
  if (spec.num) {
    const n = Math.round(Number(raw));
    return Number.isFinite(n) ? String(Math.min(spec.num[1], Math.max(spec.num[0], n))) : fallback;
  }
  if (spec.url) return /^https:\/\/[^\s"'<>]+$/i.test(raw) ? raw : '';
  if (spec.link) return /^(https:\/\/[^\s"'<>]+|#[\w-]*|mailto:[^\s"'<>]+|tel:[+\d][\d\s()-]*)$/i.test(raw) ? raw : '';
  if (spec.lines) {
    const { count, each } = spec.lines;
    return raw.split('\n').map((line) => line.trim().slice(0, each)).filter(Boolean).slice(0, count).join('\n');
  }
  return raw;
}

export function normalizePage(value: unknown): PageData | null {
  const raw = value as { content?: unknown; root?: { props?: Record<string, unknown> } } | null;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.content)) return null;

  const used = new Set<string>();
  const content: PageBlock[] = [];
  let enquiry = false;
  for (const item of raw.content.slice(0, 120) as Brief[]) {
    const type = item?.type as BlockType;
    if (!BLOCK_TYPES.includes(type)) continue;
    if (type === 'Enquiry') {
      if (enquiry) continue; // one lead form per page
      enquiry = true;
    }
    const props: Record<string, string> = { ...COMMON_DEFAULTS, ...DEFAULTS[type] };
    const specs = { ...COMMON, ...SPECS[type] };
    for (const [key, spec] of Object.entries(specs)) {
      if (item?.props && key in item.props) props[key] = clean(item.props[key], spec, props[key] ?? '');
    }
    let id = text(item?.props?.id, 40).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id || used.has(id)) id = `${type}-${content.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
    used.add(id);
    content.push({ type, props: { ...props, id } });
  }
  if (!content.length) return null;

  const rootProps: Record<string, string> = {};
  for (const [key, spec] of Object.entries(ROOT_SPECS)) {
    const wanted = raw.root?.props && key in raw.root.props ? clean(raw.root.props[key], spec, ROOT_DEFAULTS[key]) : ROOT_DEFAULTS[key];
    rootProps[key] = key === 'accent' && !wanted ? ROOT_DEFAULTS.accent : wanted;
  }
  return { root: { props: rootProps }, content };
}

/** The page a funnel starts with: its brief laid out as blocks. */
export function pageFromBrief(brief: Brief): PageData {
  const offer = brief?.offer ?? {};
  const blocks: unknown[] = [
    {
      type: 'Hero',
      props: { id: 'hero', headline: offer.headline ?? '', subheadline: offer.subheadline ?? '', buttonLabel: brief?.cta?.label ?? 'Get in touch', buttonLink: '#enquire', tone: 'plain' },
    },
  ];
  const bulletItems = (section: Brief) => (Array.isArray(section?.bullets) ? section.bullets : []).map((bullet: string) => String(bullet)).join('\n');
  let n = 0;
  for (const section of Array.isArray(brief?.sections) ? brief.sections : []) {
    const id = String(section?.id ?? '');
    if (['hero', 'faq', 'final-cta'].includes(id)) continue;
    n++;
    // How it works becomes numbered steps; a solution with several points reads well as cards.
    if (id === 'how-it-works' && Array.isArray(section?.bullets) && section.bullets.length >= 2) {
      blocks.push({ type: 'Steps', props: { id: `steps-${n}`, title: section?.title ?? '', intro: section?.body ?? '', items: bulletItems(section), tone: 'alt' } });
      continue;
    }
    if (id === 'solution' && Array.isArray(section?.bullets) && section.bullets.length >= 3) {
      blocks.push({ type: 'Features', props: { id: `features-${n}`, title: section?.title ?? '', intro: section?.body ?? '', items: bulletItems(section), columns: '3', tone: 'alt' } });
      continue;
    }
    blocks.push({
      type: 'Section',
      props: { id: `section-${n}`, title: section?.title ?? '', body: section?.body ?? '', bullets: bulletItems(section), tone: n % 2 === 0 ? 'alt' : 'plain' },
    });
  }
  const faq = (Array.isArray(brief?.faq) ? brief.faq : []).filter((item: Brief) => item?.q && item?.a);
  if (faq.length) {
    blocks.push({ type: 'FAQ', props: { id: 'faq', title: 'Questions', items: faq.map((item: Brief) => `${item.q} | ${item.a}`).join('\n'), tone: 'plain' } });
  }
  blocks.push({ type: 'CallToAction', props: { id: 'cta', title: offer.promise ? String(offer.promise).slice(0, 120) : 'Ready when you are', text: '', buttonLabel: brief?.cta?.label ?? 'Get in touch', buttonLink: '#enquire', tone: 'accent' } });
  blocks.push({ type: 'Enquiry', props: { id: 'enquiry' } });
  return normalizePage({ content: blocks }) as PageData;
}
