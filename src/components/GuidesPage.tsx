import React, { useEffect, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Route } from '../types';
import { GUIDES, Guide, GuideCategory, findGuide } from '../lib/guides';
import LeadCapture from './LeadCapture';
import { BREADMAKER_THEME, LeakTestBand, H1, H2, Label, Pill, Section, TextLink, themeStyle } from './program-ui';

interface GuidesPageProps {
  /** The guide slug from the URL, or undefined for the index. */
  slug?: string;
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

const CARD_SHADOW = 'border border-[var(--pg-line-soft)]';
const CATEGORIES: ('All' | GuideCategory)[] = ['All', 'Diagnose', 'Get paid', 'Build', 'Systems'];

/** A real link, so guides can be opened in a new tab and shared, that still navigates in-app on a plain click. */
function GuideLink({
  slug,
  openPath,
  className,
  children,
}: {
  slug: string;
  openPath: (path: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const href = `/guides/${slug}`;
  return (
    <a
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        openPath(href);
      }}
      className={className}
    >
      {children}
    </a>
  );
}

function GuideCard({ guide, openPath }: { guide: Guide; openPath: (path: string) => void; key?: React.Key }) {
  return (
    <GuideLink
      slug={guide.slug}
      openPath={openPath}
      className={`group flex h-full flex-col rounded-[17px] bg-[var(--pg-card)] p-8 transition-transform duration-200 hover:-translate-y-0.5 lg:p-9 ${CARD_SHADOW}`}
    >
      <p className="font-label text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">
        {guide.category}
      </p>
      <h3 className="mt-3 font-editorial text-[26px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--pg-ink)]">
        {guide.title}
      </h3>
      <p className="mt-3.5 text-[16px] leading-[1.6] text-[var(--pg-body)]">{guide.summary}</p>
      <div className="mt-auto flex items-center justify-between pt-7">
        <span className="inline-flex items-center gap-2 text-[15px] font-medium text-[var(--pg-accent)] underline underline-offset-[6px]">
          Learn more
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
        <span className="font-label text-[12.5px] text-[var(--pg-body)]">{guide.minutes} min</span>
      </div>
    </GuideLink>
  );
}

function GuidesIndex({ onNavigate, openPath }: Omit<GuidesPageProps, 'slug'>) {
  const [category, setCategory] = useState<'All' | GuideCategory>('All');
  const shown = category === 'All' ? GUIDES : GUIDES.filter((guide) => guide.category === category);

  return (
    <>
      <section>
        <div className="mx-auto max-w-[1312px] px-6 pb-12 pt-12 lg:pb-16 lg:pt-16">
          <Label>Free guides</Label>
          <H1 className="mt-5 max-w-[860px]">How each system works.</H1>
          <p className="mt-6 max-w-[720px] text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[22px]">
            Plain-language guides from the systems we test ourselves: where a business leaks, how to get paid
            online, and how to own what you run on. No jargon, no promised earnings.
          </p>
        </div>
      </section>

      <Section pad="bottom">
        <div className="flex flex-wrap gap-2.5" role="tablist" aria-label="Filter guides">
          {CATEGORIES.map((item) => {
            const active = item === category;
            return (
              <button
                key={item}
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(item)}
                className={`rounded-full border px-5 py-2 text-[14.5px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'border-[var(--pg-accent)] bg-[var(--pg-accent)] text-[var(--pg-accent-ink)]'
                    : 'border-[var(--pg-line)] text-[var(--pg-ink)] hover:bg-[var(--pg-alt)]'
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
        <div className="mt-10 grid gap-[30px] md:grid-cols-2 lg:grid-cols-3">
          {shown.map((guide) => (
            <GuideCard key={guide.slug} guide={guide} openPath={openPath} />
          ))}
        </div>
      </Section>

      <LeadCapture source="guides" />

      <LeakTestBand onNavigate={onNavigate} />

    </>
  );
}

function GuideArticle({ guide, onNavigate, openPath }: { guide: Guide } & Omit<GuidesPageProps, 'slug'>) {
  const related = GUIDES.filter((item) => item.slug !== guide.slug && item.category === guide.category)
    .concat(GUIDES.filter((item) => item.slug !== guide.slug && item.category !== guide.category))
    .slice(0, 3);

  return (
    <>
      <section>
        <div className="mx-auto max-w-[1312px] px-6 pb-12 pt-12 lg:pb-16 lg:pt-16">
          <Label>{guide.category}</Label>
          <H1 className="mt-5 max-w-[900px] sm:text-[48px] lg:text-[58px] xl:text-[64px]">{guide.title}</H1>
          <p className="mt-6 max-w-[720px] text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[22px]">
            {guide.summary}
          </p>
          <p className="mt-5 font-label font-medium text-[13px] uppercase tracking-[0.06em] text-[var(--pg-body)]">
            {guide.minutes} minute read
          </p>
        </div>
      </section>

      <Section tone="white" pad="default">
        <div className="mx-auto max-w-[760px]">
          <div className="space-y-14">
            {guide.sections.map((section) => (
              <article key={section.heading}>
                <h2 className="font-editorial text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--pg-ink)] lg:text-[32px]">
                  {section.heading}
                </h2>
                {section.paragraphs?.map((text) => (
                  <p key={text} className="mt-4 text-[17px] leading-[1.7] text-[var(--pg-body)]">
                    {text}
                  </p>
                ))}
                {section.points && (
                  <ul className="mt-5 space-y-3">
                    {section.points.map((point) => (
                      <li key={point} className="flex items-start gap-3.5 text-[16.5px] leading-[1.5] text-[var(--pg-ink)]">
                        <Check className="mt-[3px] h-[18px] w-[18px] shrink-0 text-[var(--pg-accent)]" strokeWidth={2.75} aria-hidden />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {section.done && (
                  <p className={`mt-6 rounded-[13px] bg-[var(--pg-alt)] p-5 text-[16px] leading-[1.55] text-[var(--pg-ink)] ${CARD_SHADOW}`}>
                    <span className="font-label text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">
                      Done when
                    </span>
                    <span className="mt-1.5 block">{section.done}</span>
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </Section>

      <Section tone="dark" pad="default">
        <Label tone="dark">Next step</Label>
        <H2 tone="dark" className="mt-7 max-w-[760px]">{guide.next.label}</H2>
        <p className="mt-5 max-w-[620px] text-[18px] leading-[1.6] text-[var(--pg-dark-body)]">{guide.next.blurb}</p>
        <Pill variant="cream" size="lg" className="mt-9" onClick={() => onNavigate(guide.next.route)}>
          Continue
        </Pill>
      </Section>

      <LeadCapture source={`guide:${guide.slug}`} tone="white" />

      <Section pad="default">
        <Label>Keep reading</Label>
        <div className="mt-8 grid gap-[30px] md:grid-cols-2 lg:grid-cols-3">
          {related.map((item) => (
            <GuideCard key={item.slug} guide={item} openPath={openPath} />
          ))}
        </div>
        <div className="mt-10">
          <TextLink onClick={() => openPath('/guides')}>All guides</TextLink>
        </div>
      </Section>
    </>
  );
}

export default function GuidesPage({ slug, onNavigate, openPath }: GuidesPageProps) {
  const guide = findGuide(slug);

  // Keep the tab title in step with the page; restore it on leaving.
  useEffect(() => {
    const previous = document.title;
    document.title = guide ? `${guide.title} | Breadmaker Systems` : 'Free guides | Breadmaker Systems';
    return () => {
      document.title = previous;
    };
  }, [guide]);

  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)]">
      {guide ? (
        <GuideArticle guide={guide} onNavigate={onNavigate} openPath={openPath} />
      ) : (
        <GuidesIndex onNavigate={onNavigate} openPath={openPath} />
      )}
    </div>
  );
}
