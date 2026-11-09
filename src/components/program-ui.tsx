import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Menu, Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Route } from '../types';

/**
 * Shared primitives for the Breadmaker program landing pages
 * (Breadmaker Foundry and Breadmaker Launchpad).
 *
 * Both pages follow the same simple editorial structure, borrowed from the
 * Sherley reference: cream paper background, serif display headings,
 * monospace section labels, flat white cards, one dark band for
 * the problem statement, a dark investment block, FAQ, and a colour CTA band.
 *
 * Spacing and type scale are calibrated against the supplied design PDFs at a
 * 1440px viewport (design container = 1260px content, 90px side margins).
 */

export interface ProgramTheme {
  /** page background */
  bg: string;
  /** alternating band background */
  alt: string;
  /** primary ink */
  ink: string;
  /** body copy */
  body: string;
  /** accent colour (buttons, labels, checks) */
  accent: string;
  /** text on accent surfaces */
  accentInk: string;
  /** label colour used on dark surfaces */
  labelOnDark: string;
  /** dark band background */
  dark: string;
  /** text on dark surfaces */
  darkInk: string;
  /** body copy on dark surfaces */
  darkBody: string;
  /** card surface */
  card: string;
  /** hairline on light surfaces */
  line: string;
  /** softer hairline on light surfaces */
  lineSoft: string;
}

export const FOUNDRY_THEME: ProgramTheme = {
  bg: '#F5F1E6',
  alt: '#ECE5D3',
  ink: '#1E1B16',
  body: '#5B544A',
  accent: '#A24712',
  accentInk: '#F8F4E9',
  labelOnDark: '#DFB392',
  dark: '#1E1B16',
  darkInk: '#F5F1E6',
  darkBody: 'rgba(245, 241, 230, 0.74)',
  card: '#FEFDF8',
  line: 'rgba(30, 27, 22, 0.16)',
  lineSoft: 'rgba(30, 27, 22, 0.10)',
};

export const LAUNCHPAD_THEME: ProgramTheme = {
  bg: '#F4F1E8',
  alt: '#EAE4D4',
  ink: '#1C1B16',
  body: '#57534A',
  accent: '#1D6A58',
  accentInk: '#F6F3E9',
  labelOnDark: '#DDB07D',
  dark: '#1C1B16',
  darkInk: '#F4F1E8',
  darkBody: 'rgba(244, 241, 232, 0.74)',
  card: '#FEFDF8',
  line: 'rgba(28, 27, 22, 0.16)',
  lineSoft: 'rgba(28, 27, 22, 0.10)',
};

/** The Breadmaker Systems umbrella (homepage) shares Foundry's palette. */
export const BREADMAKER_THEME: ProgramTheme = FOUNDRY_THEME;

/** Exposes the theme as CSS custom properties so Tailwind arbitrary values can use it. */
export function themeStyle(theme: ProgramTheme): React.CSSProperties {
  return {
    '--pg-bg': theme.bg,
    '--pg-alt': theme.alt,
    '--pg-ink': theme.ink,
    '--pg-body': theme.body,
    '--pg-accent': theme.accent,
    '--pg-accent-ink': theme.accentInk,
    '--pg-label-dark': theme.labelOnDark,
    '--pg-dark': theme.dark,
    '--pg-dark-ink': theme.darkInk,
    '--pg-dark-body': theme.darkBody,
    '--pg-card': theme.card,
    '--pg-line': theme.line,
    '--pg-line-soft': theme.lineSoft,
  } as React.CSSProperties;
}

const CARD_SHADOW = 'border border-[var(--pg-line-soft)]';
const CONTAINER = 'mx-auto max-w-[1312px] px-6 lg:px-6';
/** Header and footer run wider than the page content. */
const CHROME_CONTAINER = 'mx-auto max-w-[1760px] px-6 lg:px-10';

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export interface ProgramNavLink {
  /** in-page section to scroll to */
  id: string;
  label: string;
  /** overrides the scroll, e.g. to navigate to another route */
  onClick?: () => void;
  /** renders as a muted back link with a left arrow */
  back?: boolean;
}

/** The Breadmaker "B." mark. */
export function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  return <img src="/logo-mark.svg" alt="" aria-hidden="true" className={`shrink-0 rounded-[6px] ${className}`} />;
}

/** The slim strip above the header that points visitors to the free Business Leak Test. */
export function AnnouncementBar() {
  const open = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    window.history.pushState({}, '', '/leak-test');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0 });
  };
  return (
    <a
      href="/leak-test"
      onClick={open}
      style={{
        ...themeStyle(BREADMAKER_THEME),
        backgroundColor: 'color-mix(in srgb, var(--pg-accent) 20%, var(--pg-dark))',
      }}
      className="group block border-b border-white/10 font-inter"
    >
      <div className="mx-auto flex max-w-[1312px] items-center justify-center gap-x-3.5 px-5 py-3.5 text-[15px] sm:px-6">
        <span className="shrink-0 whitespace-nowrap rounded-md bg-black px-3.5 py-1.5 font-semibold text-[var(--pg-dark-ink)]">Business Leak Test</span>
        <span className="min-w-0 truncate text-[var(--pg-dark-body)]">Find where your business is leaking in 4 minutes</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--pg-dark-body)] transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </a>
  );
}

export function ProgramNav({
  brand,
  accentWord,
  links,
  ctaLabel,
  onCta,
  onBrand,
  secondaryLabel,
  onSecondary,
  theme,
  announcement = true,
}: {
  brand: string;
  accentWord: string;
  links: ProgramNavLink[];
  /** Omit both to show no call-to-action button (e.g. on the apply form itself). */
  ctaLabel?: string;
  onCta?: () => void;
  /** defaults to scrolling to the top of the page */
  onBrand?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Sets the palette when the nav is used outside a themed page wrapper. */
  theme?: ProgramTheme;
  /** Show the Business Leak Test strip above the header. Off on focused form pages. */
  announcement?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Close the mobile menu when the viewport grows past the desktop breakpoint.
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = () => media.matches && setOpen(false);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  /** Closes the menu before running a nav action, so in-page scrolls land correctly. */
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <>
    {announcement && <AnnouncementBar />}
    <header
      style={theme ? themeStyle(theme) : undefined}
      className={`sticky top-0 z-50 font-inter transition-colors ${open ? 'bg-white' : 'bg-[var(--pg-bg)]'}`}
    >
      <div className={`${CHROME_CONTAINER} flex items-center py-5 lg:py-[28px]`}>
        <button
          onClick={run(onBrand ?? (() => window.scrollTo({ top: 0, behavior: 'smooth' })))}
          className="flex items-center gap-2.5 font-editorial text-[22px] font-semibold tracking-[-0.01em] text-[var(--pg-ink)] whitespace-nowrap cursor-pointer lg:text-[25px]"
        >
          <BrandMark />
          <span>
            {brand}
            {!['Systems', 'Launchpad', 'Foundry'].includes(accentWord) && <> <span className="text-[var(--pg-accent)]">{accentWord}</span></>}
          </span>
        </button>

        {links.some((link) => !link.back) && (
        <nav className="mx-auto hidden items-center gap-[40px] xl:gap-[50px] lg:flex">
            {links.filter((link) => !link.back).map((link) => {
              const active = !link.back && typeof window !== 'undefined' && window.location.pathname.split('/')[1] === link.id;
              return (
              <button
                key={link.id}
                onClick={link.onClick ?? (() => scrollToId(link.id))}
                aria-current={active ? 'page' : undefined}
                className={
                  link.back
                    ? 'inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--pg-ink)] transition-opacity hover:opacity-70 cursor-pointer'
                    : `relative py-1 text-[15.5px] font-semibold transition-colors duration-200 cursor-pointer after:absolute after:inset-x-0 after:-bottom-0.5 after:h-[2px] after:origin-left after:bg-[var(--pg-accent)] after:transition-transform after:duration-200 motion-reduce:transition-none motion-reduce:after:transition-none ${
                        active
                          ? 'text-[var(--pg-accent)] after:scale-x-100'
                          : 'text-[var(--pg-ink)] hover:text-[var(--pg-accent)] after:scale-x-0 hover:after:scale-x-100'
                      }`
                }
              >
                {link.back && <ArrowLeft className="h-4 w-4" />}
                {link.label}
              </button>
              );
            })}
        </nav>
        )}

        <div className={`ml-auto flex items-center gap-3 lg:gap-6 ${links.some((link) => !link.back) ? 'lg:ml-0' : ''}`}>
          {/* Back links sit at the right edge of the page. */}
          {links.filter((link) => link.back).map((link) => (
            <button
              key={link.id}
              onClick={link.onClick ?? (() => scrollToId(link.id))}
              className="hidden items-center gap-2 text-[15px] font-semibold text-[var(--pg-ink)] transition-opacity hover:opacity-70 cursor-pointer lg:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" />
              {link.label}
            </button>
          ))}
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="hidden text-[15.5px] font-semibold text-[var(--pg-ink)] underline underline-offset-[6px] transition-colors hover:text-[var(--pg-accent)] cursor-pointer lg:inline"
            >
              {secondaryLabel}
            </button>
          )}

          {ctaLabel && onCta && (
          <button
            onClick={onCta}
            className="hidden items-center justify-center whitespace-nowrap rounded-full bg-[var(--pg-accent)] px-5 py-3 text-[14px] font-medium text-[var(--pg-accent-ink)] transition-opacity hover:opacity-90 cursor-pointer sm:inline-flex lg:px-8 lg:py-3.5 lg:text-[15px]"
          >
            {ctaLabel}
          </button>
          )}

          <button
            onClick={() => setOpen((value) => !value)}
            className="-mr-2 rounded-full p-2 text-[var(--pg-ink)] transition-colors hover:bg-[var(--pg-alt)] cursor-pointer lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-[var(--pg-line-soft)] bg-white lg:hidden"
          >
            <nav className={`${CHROME_CONTAINER} flex flex-col py-4`}>
              {links.map((link) => (
                <button
                  key={link.id}
                  onClick={run(link.onClick ?? (() => scrollToId(link.id)))}
                  className="border-b border-[var(--pg-line-soft)] py-4 text-left font-editorial text-[22px] font-semibold text-[var(--pg-ink)] cursor-pointer"
                >
                  {link.label}
                </button>
              ))}
              <div className="flex flex-col gap-3 pb-2 pt-6">
                {ctaLabel && onCta && (
                <button
                  onClick={run(onCta)}
                  className="w-full rounded-full bg-[var(--pg-accent)] px-6 py-3.5 text-[15px] font-medium text-[var(--pg-accent-ink)] cursor-pointer"
                >
                  {ctaLabel}
                </button>
                )}
                {secondaryLabel && onSecondary && (
                  <button
                    onClick={run(onSecondary)}
                    className="w-full rounded-full border border-[var(--pg-line)] px-6 py-3.5 text-[15px] font-medium text-[var(--pg-ink)] cursor-pointer"
                  >
                    {secondaryLabel}
                  </button>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
    </>
  );
}


const LEGAL_LINKS: { label: string; route?: Route; href?: string }[] = [
  { label: 'Privacy', route: 'privacy' },
  { label: 'Terms', route: 'terms' },
  { label: 'DPA', route: 'dpa' },
  { label: 'llms.txt', href: '/llms.txt' },
];

/** The one site-wide footer. It carries its own theme so it looks identical on every page. */
export function ProgramFooter({ onNavigate }: { onNavigate: (route: Route) => void }) {
  return (
    <footer style={themeStyle(BREADMAKER_THEME)} className="bg-[var(--pg-dark)] font-inter">
      <div className={CHROME_CONTAINER}>
        <div className={`flex border-t border-white/10 flex-col gap-3 py-5 text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--pg-dark-body)] sm:flex-row sm:items-center sm:justify-between`}>
          <p>&copy; {new Date().getFullYear()} Restart Integrated Systems Ltd.</p>
          <nav aria-label="Legal" className="flex flex-col gap-4 text-[16px] font-normal normal-case tracking-normal sm:flex-row sm:items-center sm:gap-x-8 sm:text-[14px]">
            {LEGAL_LINKS.map((link) =>
              link.href ? (
                <a key={link.label} href={link.href} className="text-[var(--pg-dark-body)] transition-colors hover:text-[var(--pg-dark-ink)]">
                  {link.label}
                </a>
              ) : (
                <button key={link.label} onClick={() => onNavigate(link.route!)} className="text-left text-[var(--pg-dark-body)] transition-colors hover:text-[var(--pg-dark-ink)] cursor-pointer">
                  {link.label}
                </button>
              ),
            )}
          </nav>
        </div>
      </div>
    </footer>
  );
}

type SectionPad = 'tight' | 'default' | 'wide' | 'loose' | 'bottom' | 'intro';

const PAD_CLASS: Record<SectionPad, string> = {
  tight: 'py-12 lg:py-[52px]',
  default: 'py-20 lg:py-28',
  wide: 'py-24 lg:py-32',
  loose: 'py-24 lg:py-[120px]',
  bottom: 'pt-0 pb-20 lg:pb-28',
  /** the first section of a page, spaced like the Guides intro */
  intro: 'pt-12 pb-20 lg:pt-16 lg:pb-28',
};

export function Section({
  id,
  tone = 'base',
  pad = 'default',
  className = '',
  children,
}: {
  id?: string;
  tone?: 'base' | 'alt' | 'dark' | 'white';
  pad?: SectionPad;
  className?: string;
  children: React.ReactNode;
}) {
  const bg =
    tone === 'dark'
      ? 'bg-[var(--pg-dark)]'
      : tone === 'alt'
        ? 'bg-[var(--pg-alt)]'
        : tone === 'white'
          ? 'bg-white'
          : 'bg-[var(--pg-bg)]';

  return (
    <section id={id} className={`${bg} scroll-mt-20 ${className}`}>
      <div className={`${CONTAINER} ${PAD_CLASS[pad]}`}>{children}</div>
    </section>
  );
}

export function Label({
  children,
  tone = 'light',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <p
      className={`font-label text-[14px] font-semibold uppercase tracking-[0.06em] ${
        tone === 'dark' ? 'text-[var(--pg-label-dark)]' : 'text-[var(--pg-accent)]'
      } ${className}`}
    >
      {children}
    </p>
  );
}

export function H1({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={`max-w-[660px] font-editorial text-[36px] font-bold leading-[1.02] tracking-[-0.02em] text-[var(--pg-ink)] sm:text-[46px] lg:text-[58px] xl:text-[66px] ${className}`}
    >
      {children}
    </h1>
  );
}

export function H2({
  children,
  tone = 'light',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <h2
      className={`font-editorial text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[42px] lg:text-[50px] ${
        tone === 'dark' ? 'text-[var(--pg-dark-ink)]' : 'text-[var(--pg-ink)]'
      } ${className}`}
    >
      {children}
    </h2>
  );
}

type PillVariant = 'accent' | 'dark' | 'cream';

export function Pill({
  children,
  onClick,
  variant = 'accent',
  size = 'md',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: PillVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const variantClass =
    variant === 'accent'
      ? 'bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]'
      : variant === 'dark'
        ? 'bg-[var(--pg-dark)] text-[var(--pg-dark-ink)]'
        : 'bg-[var(--pg-dark-ink)] text-[var(--pg-dark)]';
  const sizeClass =
    size === 'sm'
      ? 'px-7 py-3 text-[14.5px]'
      : size === 'lg'
        ? 'px-12 py-4 text-[17px]'
        : 'px-6 py-3 text-[15px]';

  return (
    <button
      onClick={onClick}
      className={`inline-flex w-fit items-center justify-center rounded-full font-medium transition-opacity hover:opacity-90 cursor-pointer ${variantClass} ${sizeClass} ${className}`}
    >
      {children}
    </button>
  );
}

export function TextLink({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-fit text-[16px] font-medium text-[var(--pg-ink)] underline underline-offset-[6px] transition-opacity hover:opacity-70 cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}

/** Adds hairlines between consecutive rows. */
export function RowGroup({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`[&>*+*]:border-t [&>*+*]:border-[var(--pg-line-soft)] ${className}`}>
      {children}
    </div>
  );
}

export function CheckRow({ children }: { children: React.ReactNode; key?: React.Key }) {
  return (
    <div className="flex items-start gap-4 py-5">
      <Check className="mt-[3px] h-[18px] w-[18px] shrink-0 text-[var(--pg-accent)]" strokeWidth={2.75} />
      <span className="text-[16.5px] leading-[1.5] text-[var(--pg-ink)]">{children}</span>
    </div>
  );
}

export function XRow({ children }: { children: React.ReactNode; key?: React.Key }) {
  return (
    <div className="flex items-start gap-4 py-5">
      <X className="mt-[3px] h-[18px] w-[18px] shrink-0 text-[var(--pg-ink)]" strokeWidth={2} />
      <span className="text-[16.5px] leading-[1.5] text-[var(--pg-ink)]">{children}</span>
    </div>
  );
}

export function ChecklistCard({
  label,
  title,
  children,
  className = '',
}: {
  label: string;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[11px] bg-[var(--pg-card)] p-9 lg:p-10 ${CARD_SHADOW} ${className}`}>
      <p className="font-label text-[12.5px] font-medium uppercase tracking-[0.06em] text-[var(--pg-body)]">
        {label}
      </p>
      <h3 className="mt-4 font-editorial text-[30px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--pg-ink)]">
        {title}
      </h3>
      <RowGroup className="mt-4">{children}</RowGroup>
    </div>
  );
}

export function StepCard({
  label,
  title,
  body,
  doneLabel,
  doneText,
}: {
  key?: React.Key;
  label: string;
  title: string;
  body: string;
  doneLabel?: string;
  doneText?: string;
}) {
  return (
    <div className={`flex h-full flex-col rounded-[17px] bg-[var(--pg-card)] p-8 lg:p-10 ${CARD_SHADOW}`}>
      <p className="font-label text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">
        {label}
      </p>
      <h3 className="mt-3 font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.01em] text-[var(--pg-ink)] lg:text-[32px]">
        {title}
      </h3>
      <p className="mt-4 text-[16px] leading-[1.6] text-[var(--pg-body)]">{body}</p>
      {doneText && (
        <div className="mt-auto pt-7">
          <div className="border-t border-[var(--pg-line-soft)] pt-5">
            <p className="text-[16px] leading-[1.6] text-[var(--pg-ink)]">
              <span className="font-semibold">{doneLabel}</span> {doneText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function FeatureCard({
  title,
  body,
}: {
  key?: React.Key;
  title: string;
  body: string;
}) {
  return (
    <div className={`h-full rounded-[17px] bg-[var(--pg-card)] p-8 lg:p-10 ${CARD_SHADOW}`}>
      <h3 className="font-editorial text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--pg-ink)]">
        {title}
      </h3>
      <p className="mt-3.5 text-[16px] leading-[1.65] text-[var(--pg-body)]">{body}</p>
    </div>
  );
}

export function FitCard({
  title,
  compact = false,
  children,
}: {
  title: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-[11px] bg-[var(--pg-card)] p-8 lg:p-10 ${CARD_SHADOW}`}>
      <h3 className="font-editorial text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--pg-ink)]">
        {title}
      </h3>
      <div
        className={`mt-4 ${
          compact
            ? '[&>div]:py-[10px]'
            : '[&>*+*]:border-t [&>*+*]:border-[var(--pg-line-soft)]'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function InvestmentBlock({
  label,
  price,
  body,
  ctaLabel,
  onCta,
  includedTitle,
  includedBody,
  promiseTitle,
  promiseBody,
}: {
  label: string;
  price: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
  includedTitle: string;
  includedBody: string;
  promiseTitle: string;
  promiseBody: string;
}) {
  return (
    <div className="rounded-[11px] bg-[var(--pg-dark)] p-10 lg:p-16">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="font-label text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-label-dark)]">
            {label}
          </p>
          <p className="mt-5 font-editorial text-[46px] font-semibold leading-none tracking-[-0.02em] text-[var(--pg-dark-ink)] lg:text-[54px]">
            {price}
          </p>
          <p className="mt-6 max-w-[440px] text-[16.5px] leading-[1.65] text-[var(--pg-dark-body)]">
            {body}
          </p>
          <Pill variant="cream" className="mt-9" onClick={onCta}>
            {ctaLabel}
          </Pill>
        </div>

        <div className="space-y-9 lg:pt-1">
          <div>
            <h3 className="font-editorial text-[24px] font-semibold leading-[1.15] text-[var(--pg-dark-ink)]">
              {includedTitle}
            </h3>
            <p className="mt-3 text-[16px] leading-[1.65] text-[var(--pg-dark-body)]">
              {includedBody}
            </p>
          </div>
          <div>
            <h3 className="font-editorial text-[24px] font-semibold leading-[1.15] text-[var(--pg-dark-ink)]">
              {promiseTitle}
            </h3>
            <p className="mt-3 text-[16px] leading-[1.65] text-[var(--pg-dark-body)]">
              {promiseBody}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface FaqEntry {
  question: string;
  answer: React.ReactNode;
}

/** Accordion: click a question to reveal its answer. The first one starts open. */
export function FaqBlock({ items, className = '' }: { items: FaqEntry[]; className?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className={`max-w-[880px] border-b border-[var(--pg-line)] ${className}`}>
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={index} className="border-t border-[var(--pg-line)]">
            <button
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              className="group flex w-full items-center justify-between gap-6 py-7 text-left cursor-pointer lg:py-8"
            >
              <h3 className="font-editorial text-[20px] font-semibold leading-[1.25] tracking-[-0.01em] text-[var(--pg-ink)] transition-opacity group-hover:opacity-75 lg:text-[22px]">
                {item.question}
              </h3>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                  isOpen
                    ? 'rotate-45 border-[var(--pg-accent)] bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]'
                    : 'border-[var(--pg-line)] text-[var(--pg-ink)]'
                }`}
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <p className="max-w-[760px] pb-8 pr-14 text-[17px] leading-[1.6] text-[var(--pg-body)]">{item.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** The one site-wide "not sure where to start" band: dark, leads to the Leak Test. */
export function LeakTestBand({ onNavigate }: { onNavigate: (route: Route) => void }) {
  return (
    <Section tone="dark" pad="default">
      <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
        <div>
          <Label tone="dark">Not sure where to start?</Label>
          <H2 tone="dark" className="mt-7 max-w-[640px]">Find your biggest leak first.</H2>
          <p className="mt-5 max-w-[620px] text-[18px] leading-[1.6] text-[var(--pg-dark-body)]">
            The free Business Leak Test takes about four minutes. You get a score and the one area to fix first,
            and you will know which guide to read next.
          </p>
        </div>
        <div className="lg:justify-self-end">
          <Pill variant="cream" size="lg" onClick={() => onNavigate('leak-test')}>
            Take the free test
          </Pill>
        </div>
      </div>
    </Section>
  );
}

export function CtaBand({
  heading,
  ctaLabel,
  onCta,
}: {
  heading: React.ReactNode;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <section className="border-b border-white/10 bg-[var(--pg-dark)]">
      <div className={`${CONTAINER} flex flex-col gap-8 py-20 lg:flex-row lg:items-center lg:justify-between lg:py-28`}>
        <h2 className="max-w-[620px] font-editorial text-[32px] font-semibold leading-[1.12] tracking-[-0.02em] text-[var(--pg-dark-ink)] sm:text-[38px] lg:text-[42px]">
          {heading}
        </h2>
        <Pill variant="cream" size="lg" onClick={onCta}>
          {ctaLabel}
        </Pill>
      </div>
    </section>
  );
}
