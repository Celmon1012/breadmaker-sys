import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Route } from '../types';
import { useProgramStatus } from '../hooks/useProgramStatus';
import { LAUNCHPAD_VIDEO_URL, formatProgramDate, placesLabel } from '../lib/program-config';
import { describeVideo } from '../lib/lessonVideo';
import VideoSlot from './VideoSlot';
import { FUNNEL_PLATFORMS } from '../lib/program-questions';
import LaunchpadApplySection from './LaunchpadApplySection';
import { PlatformIcon, PlatformTile } from './PlatformIcons';
import {
  LAUNCHPAD_THEME,
  themeStyle,
  ProgramNav,
  ProgramFooter,
  Section,
  Label,
  H1,
  H2,
  Pill,
  TextLink,
  RowGroup,
  CheckRow,
  XRow,
  ChecklistCard,
  StepCard,
  FeatureCard,
  FitCard,
  FaqBlock,
  CtaBand,
  scrollToId,
} from './program-ui';

interface LaunchpadLandingPageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

const NAV_LINKS = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'what-you-get', label: 'What you get' },
  { id: 'apply', label: 'Reserve your spot' },
  { id: 'who-it-is-for', label: 'Who it is for' },
  { id: 'faq', label: 'FAQ' },
];

const LAUNCH_CHECKS = [
  'Your offer, written clearly on one page',
  'A professional page that works on a phone',
  'A way to take enquiries, bookings or payments',
  'An automatic reply the moment someone signs up',
  'Tracking, so you can see what is working',
];

const SIMPLICITY_PILLARS = [
  {
    title: 'Nothing to figure out',
    body: 'One clear step each day.',
  },
  {
    title: 'Built with you',
    body: 'We do the hard parts and show you how.',
  },
  {
    title: 'Yours to keep',
    body: 'Your content, your domain, your page.',
  },
];

const DAYS = [
  {
    label: 'Day 1',
    title: 'Start call',
    body: 'A 30-minute call to choose your one goal and outline your offer. You leave with the plan for the week.',
  },
  {
    label: 'Day 2',
    title: 'Your offer',
    body: 'We write it together: who it is for, the problem, what you deliver, the price, and the one action you want visitors to take.',
  },
  {
    label: 'Days 3-4',
    title: 'Build',
    body: 'We build your funnel with you on Shopify, WordPress or your own stack, using a proven template. You review it and tell us what to change.',
  },
  {
    label: 'Day 5',
    title: 'Connect',
    body: 'We connect the form, booking or payments, and the tracking.',
  },
  {
    label: 'Day 6',
    title: 'Test',
    body: 'We test on a phone and a computer, run a test enquiry and a test payment, and fix what breaks.',
  },
  {
    label: 'Day 7',
    title: 'Launch',
    body: 'Your page goes live on your own domain, and you learn how to make simple changes yourself.',
  },
];

const DELIVERABLES = [
  {
    title: 'A daily plan',
    body: 'Each day you know the one thing to do. No tool hunting, no guessing what comes next.',
  },
  {
    title: 'A professional page',
    body: 'Built on a proven template, edited for your offer, and checked on a phone.',
  },
  {
    title: 'Ways to take action',
    body: 'An enquiry form, a booking link or a payment button, whichever fits how you sell.',
  },
  {
    title: 'Automatic follow-up',
    body: 'A reply that goes out the moment someone signs up, so no lead waits for you.',
  },
  {
    title: 'Tracking that makes sense',
    body: 'See your visits and enquiries in one simple view, so you know what is working.',
  },
  {
    title: 'Your platform, your choice',
    body: 'Shopify, WordPress or your own stack. You pick where it lives, and it stays yours.',
  },
];

const GOOD_FIT = [
  'Coaches, consultants, creators, local services and online sellers',
  'You are not technical and do not want to become technical',
  'You want a working page live in days, not months',
  'You can give about 1-2 hours a day for the week',
];

const FAQS = [
  {
    question: 'Do I need to know anything technical?',
    answer:
      'No. You bring your offer and answer a few questions. We handle the setup and show you each step. If you later want to own your code and server, Foundry is the next step.',
  },
  {
    question: 'What do I need to provide?',
    answer:
      'A short description of what you sell, your logo and a few photos if you have them, and access to your domain and to your Shopify or WordPress account (or your site, if it is custom). We send you a checklist before your start call.',
  },
  {
    question: 'What happens after launch?',
    answer:
      'Your funnel stays yours: your content, your domain, your store or site. You can move up to a bigger build when you are ready.',
  },
  {
    question: 'What costs are not included?',
    answer:
      'Costs that belong to other companies, such as your domain and your Shopify plan or WordPress hosting, are separate. We tell you what you need before your start call.',
  },
  {
    question: 'Which platform should I pick?',
    answer:
      'Shopify if you sell products. WordPress if you sell services, bookings or content. Custom if you already have your own site or app. Not sure? Pick the closest one and we settle it on your start call.',
  },
  {
    question: 'Do you guarantee sales?',
    answer:
      'No. We commit to a working page and to keeping you moving. What it earns depends on your offer, your market and how you follow up.',
  },
];

export default function LaunchpadLandingPage({ onNavigate, openPath }: LaunchpadLandingPageProps) {
  const status = useProgramStatus('launchpad');
  const startDate = formatProgramDate(status?.startsOn ?? null);
  const places = placesLabel(status?.remaining ?? null, status?.capacity ?? null);
  // The build-spot form is a section of this page; a platform picked above is carried into it.
  const [platform, setPlatform] = useState(() => new URLSearchParams(window.location.search).get('platform') ?? '');
  const hasVideo = ['embed', 'file'].includes(describeVideo(LAUNCHPAD_VIDEO_URL).kind);
  const goToStartCall = () => scrollToId('apply');
  const choosePlatform = (id: string) => {
    setPlatform(id.toLowerCase());
    scrollToId('apply');
  };
  // Arriving from another page (or an old /launchpad/apply link) lands on the form.
  useEffect(() => {
    if (window.location.hash !== '#apply') return;
    const timer = window.setTimeout(() => document.getElementById('apply')?.scrollIntoView({ block: 'start' }), 120);
    return () => window.clearTimeout(timer);
  }, []);
  const goToFoundry = () => onNavigate('foundry');

  return (
    <div
      style={themeStyle(LAUNCHPAD_THEME)}
      className="min-h-screen bg-[var(--pg-bg)] font-inter antialiased"
    >
      <ProgramNav
        brand="Breadmaker"
        accentWord="Launchpad"
        links={NAV_LINKS}
        onBrand={() => onNavigate('home')}
        ctaLabel="Get started"
        onCta={goToStartCall}
      />

      {/* Hero */}
      <section className="bg-[var(--pg-bg)]">
        <div className="mx-auto grid max-w-[1312px] items-center gap-14 px-6 pb-20 pt-10 lg:grid-cols-[1.38fr_1fr] lg:gap-14 lg:pb-[106px] lg:pt-[66px]">
          <div>
            <Label>Guided sales funnel launch</Label>
            <H1 className="mt-8 max-w-none! text-[32px]! sm:text-[40px]! lg:text-[46px]! xl:text-[50px]!"><span className="block">Launch your first sales funnel,</span> <span className="block">live in 7 days.</span></H1>
            <p className="mt-6 max-w-[680px] text-[16px] leading-[1.6] text-[var(--pg-body)] lg:text-[19px]">
              Pick Shopify, WordPress or your own stack. No jargon, no guesswork: we tell you exactly
              what to do each day, build the hard parts with you, and stay with you until it is live
              and taking enquiries.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5" aria-label="Platforms we build on">
              {FUNNEL_PLATFORMS.map((option) => (
                <span
                  key={option.id}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--pg-line)] bg-[var(--pg-card)] py-1.5 pl-3 pr-4 text-[14.5px] font-medium text-[var(--pg-ink)]"
                >
                  <PlatformIcon id={option.id} className="h-4 w-4" /> {option.title}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Pill size="lg" onClick={goToStartCall}>
                Reserve Your Build Spot
              </Pill>
              <TextLink onClick={() => scrollToId('how-it-works')}>See the 7 days</TextLink>
            </div>
            <p className="mt-6 text-[15px] text-[var(--pg-body)]">
              {startDate ? `Next start: ${startDate}.` : 'The next start date is being confirmed.'}{' '}
              {`${places ?? 'A few places'} each week.`}
            </p>
          </div>

          {hasVideo ? (
            <VideoSlot url={LAUNCHPAD_VIDEO_URL} title="How Launchpad works" sizeClassName="aspect-video" />
          ) : (
            <ChecklistCard label="Your launch checklist" title="Seven days, five things done.">
              {LAUNCH_CHECKS.map((item) => (
                <CheckRow key={item}>{item}</CheckRow>
              ))}
            </ChecklistCard>
          )}
        </div>
      </section>

      {/* Simplicity pillars */}
      <Section tone="alt" pad="tight">
        <div className="grid gap-x-[60px] gap-y-10 sm:grid-cols-3">
          {SIMPLICITY_PILLARS.map((pillar) => (
            <div key={pillar.title}>
              <h3 className="font-editorial text-[22px] font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--pg-ink)]">
                {pillar.title}
              </h3>
              <p className="mt-2 max-w-[340px] text-[16px] leading-[1.6] text-[var(--pg-body)]">{pillar.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* The problem */}
      <Section tone="dark" pad="loose">
        <Label tone="dark">The problem</Label>
        <H2 tone="dark" className="mt-7 max-w-[900px]">
          You are not behind. You are buried.
        </H2>
        <p className="mt-6 max-w-[1000px] text-[18px] leading-[1.6] text-[var(--pg-dark-body)] lg:text-[22px]">
          There are a thousand tutorials, a hundred tools and no one telling you what to do first.
          More information will not fix that. One clear path, one day at a time, will.
        </p>
      </Section>

      {/* How it works */}
      <Section id="how-it-works">
        <Label>How it works</Label>
        <H2 className="mt-7 max-w-[760px]">Seven days from idea to live.</H2>
        <div className="mt-12 grid gap-[30px] sm:grid-cols-2 lg:grid-cols-3">
          {DAYS.map((day) => (
            <StepCard key={day.label} label={day.label} title={day.title} body={day.body} />
          ))}
        </div>
      </Section>

      {/* Platforms */}
      <Section id="platforms" tone="white" pad="wide">
        <Label>Your platform</Label>
        <H2 className="mt-7 max-w-[820px]">Built on the platform you choose.</H2>
        <p className="mt-5 max-w-[680px] text-[17px] leading-[1.6] text-[var(--pg-body)]">
          Pick where your funnel lives and we build it there. You keep the store, the site and the domain.
        </p>
        <div className="mt-12 grid gap-[30px] md:grid-cols-3">
          {FUNNEL_PLATFORMS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => choosePlatform(option.id)}
              className="group flex flex-col rounded-[11px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-8 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--pg-accent)] cursor-pointer"
            >
              <PlatformTile id={option.id} size="lg" />
              <span className="mt-6 font-editorial text-[26px] font-semibold leading-[1.15] text-[var(--pg-ink)]">{option.title}</span>
              <span className="mt-3 flex-1 text-[16px] leading-[1.6] text-[var(--pg-body)]">{option.body}</span>
              <span className="mt-6 text-[15px] font-medium text-[var(--pg-accent)] underline-offset-4 group-hover:underline">
                Build on {option.title} →
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* What you get */}
      <Section id="what-you-get" tone="alt" pad="wide">
        <Label>What you get</Label>
        <H2 className="mt-7 max-w-[900px]">
          Everything needed to go live, and nothing you do not.
        </H2>
        <div className="mt-12 grid gap-[30px] sm:grid-cols-2 lg:grid-cols-3">
          {DELIVERABLES.map((item) => (
            <FeatureCard key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </Section>

      <LaunchpadApplySection onNavigate={onNavigate} platform={platform} />

      {/* Who it is for */}
      <Section id="who-it-is-for" pad="loose">
        <Label>Who it is for</Label>
        <H2 className="mt-7 max-w-[780px]">Made for busy owners, not tech people.</H2>
        <div className="mt-12 grid gap-[30px] lg:grid-cols-2">
          <FitCard title="A good fit if">
            {GOOD_FIT.map((item) => (
              <CheckRow key={item}>{item}</CheckRow>
            ))}
          </FitCard>
          <FitCard title="Not the right fit if">
            <XRow>You want a full software product built, not a sales funnel</XRow>
            <XRow>You expect a guaranteed number of sales</XRow>
            <XRow>You cannot make time for the start call and the daily steps</XRow>
            <XRow>
              You are technical and want to own your code and server. See{' '}
              <button
                onClick={goToFoundry}
                className="font-medium text-[var(--pg-accent)] underline underline-offset-4 transition-opacity hover:opacity-75 cursor-pointer"
              >
                Breadmaker Foundry
              </button>
              .
            </XRow>
          </FitCard>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" tone="white">
        <Label className="text-center">FAQ</Label>
        <H2 className="mx-auto mt-7 max-w-[720px] text-center">Questions before you start.</H2>
        <div className="mt-10">
          <FaqBlock items={FAQS} className="mx-auto" />
        </div>
      </Section>

      <CtaBand
        heading={<>{startDate ? `Know what to do today. Start on ${startDate}.` : 'Know what to do today. Start with the next intake.'}</>}
        ctaLabel="Reserve Your Build Spot"
        onCta={goToStartCall}
      />

      <ProgramFooter
        onNavigate={onNavigate}
      />
    </div>
  );
}
