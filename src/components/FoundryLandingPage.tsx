import React, { useEffect } from 'react';
import { Route } from '../types';
import { useProgramStatus } from '../hooks/useProgramStatus';
import FoundryApplySection from './FoundryApplySection';
import VideoSlot from './VideoSlot';
import { describeVideo } from '../lib/lessonVideo';
import { FOUNDRY_VIDEO_URL, REPLY_TIME, cohortSizeLabel, formatProgramDate, placesLabel } from '../lib/program-config';
import {
  FOUNDRY_THEME,
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

interface FoundryLandingPageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

const NAV_LINKS = [
  { id: 'the-30-days', label: 'The 30 days' },
  { id: 'what-you-get', label: 'What you get' },
  { id: 'who-it-is-for', label: 'Who it is for' },
  { id: 'apply', label: 'Apply' },
  { id: 'faq', label: 'FAQ' },
];

const SCORECARD_CHECKS = [
  'Live on your own domain',
  'Payment works end to end',
  'Leads follow up with no manual step',
  'One AI agent doing a real task',
  'Rollback and backup restore tested',
  'Security checklist signed off',
];

const OWNERSHIP_PILLARS = [
  {
    title: 'Your own server',
    body: 'Provisioned for you on day 1, so nothing is shared.',
  },
  {
    title: 'Your own code',
    body: 'A private repository in your own GitHub account.',
  },
  {
    title: 'Your own data',
    body: 'Your database, exportable at any time.',
  },
];

const WEEKS = [
  {
    label: 'Week 1',
    title: 'Frontend',
    body: 'Write your offer, ship your page on your own domain, and capture your first lead into your own database.',
    doneText:
      'a stranger understands your offer in 5 seconds and a test lead lands in your database.',
  },
  {
    label: 'Week 2',
    title: 'Backend',
    body: 'Set up your data, secure it, take a payment, and see your leads and customers in one place.',
    doneText: 'a payment completes and is recorded in your own data.',
  },
  {
    label: 'Week 3',
    title: 'Automation',
    body: 'Connect the two halves so follow-up, notifications and onboarding run without you, and put one AI agent to work.',
    doneText: 'a new lead moves through your pipeline with no manual step.',
  },
  {
    label: 'Week 4',
    title: 'Launch and operate',
    body: 'Test everything end to end, prove you can roll back and restore, lock down security, and go live.',
    doneText: 'your Day-30 scorecard passes.',
  },
];

const DELIVERABLES = [
  {
    title: 'Build-along sessions',
    body: 'Live sessions where you build your own system as you learn. Each one ends with one action and a clear definition of done.',
  },
  {
    title: 'A working starter',
    body: 'A Next.js and Supabase base with security switched on, a staging branch and an AI rules file, so you start from a system that already runs.',
  },
  {
    title: 'Your own server',
    body: 'A dedicated server for your project, paid for in your first month and managed through the Restart console.',
  },
  {
    title: 'Weekly plan and review',
    body: 'Three actions on Monday, a nudge midweek, and a Friday review that marks what is done and sets the next week.',
  },
  {
    title: 'Fast support',
    body: `Ask when you are stuck and get an answer within ${REPLY_TIME}. If something is beyond you, we can build it with you.`,
  },
  {
    title: 'Claude Code, month one',
    body: 'Your first month of Claude Code is covered, so you can describe changes in plain language and ship them.',
  },
];

const GOOD_FIT = [
  'Run or are starting a business, and own the outcome',
  'Are comfortable with GitHub basics and a terminal',
  'Have an offer, or a clear idea, and one number you want in 30 days',
  'Can give 6-8 hours a week and attend the Friday review',
  'Freelancers, small agency owners and solo founders',
];

const FAQS = [
  {
    question: 'Do I need to be a developer?',
    answer:
      'No. Foundry is for business owners and operators who want to own their systems, and our agentic team shows you what to do at every step. It helps to be comfortable with GitHub basics and a terminal, and willing to review what an AI tool changes before you push it. If that is not you yet, Launchpad is the faster path.',
  },
  {
    question: 'What do I pay after the first 30 days?',
    answer:
      'You choose. Keep the server on managed hosting for [monthly fee], move it to your own hosting account, or export everything and stop. The server and the Claude Code plan are your only ongoing costs from the program.',
  },
  {
    question: 'What if I get stuck?',
    answer:
      `Ask. Support replies within ${REPLY_TIME}, and the Friday review exists to clear whatever blocked you that week. If something is beyond the program, we can build it with you as a separate engagement.`,
  },
  {
    question: 'Do I own my code and data?',
    answer:
      'Yes. Your code lives in your own GitHub account from day 1, and you can export your database at any time. We keep ownership of our templates and course materials.',
  },
  {
    question: 'Do you guarantee sales?',
    answer:
      'No. We commit to a working system and to keeping you on track. What the system earns depends on your offer, your market and your effort.',
  },
];

export default function FoundryLandingPage({ onNavigate, openPath }: FoundryLandingPageProps) {
  const status = useProgramStatus('foundry');
  const startDate = formatProgramDate(status?.startsOn ?? null);
  const cohortSize = cohortSizeLabel(status?.capacity ?? null);
  const places = placesLabel(status?.remaining ?? null, status?.capacity ?? null);
  const full = status?.remaining === 0;
  // The application form is a section of this page.
  const goToApply = () => scrollToId('apply');
  const hasVideo = ['embed', 'file'].includes(describeVideo(FOUNDRY_VIDEO_URL).kind);
  // Arriving from another page (or an old /foundry/apply link) lands on the form.
  useEffect(() => {
    if (window.location.hash !== '#apply') return;
    const timer = window.setTimeout(() => document.getElementById('apply')?.scrollIntoView({ block: 'start' }), 120);
    return () => window.clearTimeout(timer);
  }, []);
  const goToLaunchpad = () => onNavigate('launchpad');

  return (
    <div
      style={themeStyle(FOUNDRY_THEME)}
      className="min-h-screen bg-[var(--pg-bg)] font-inter antialiased"
    >
      <ProgramNav
        brand="Breadmaker"
        accentWord="Foundry"
        links={NAV_LINKS}
        onBrand={() => onNavigate('home')}
        ctaLabel="Apply Now"
        onCta={goToApply}
      />

      {/* Hero */}
      <section className="bg-[var(--pg-bg)]">
        <div className="mx-auto grid max-w-[1312px] items-center gap-14 px-6 pb-20 pt-10 lg:grid-cols-[1.38fr_1fr] lg:gap-14 lg:pb-[106px] lg:pt-[66px]">
          <div>
            <Label>30-day build program{cohortSize ? ` · ${cohortSize}` : ''}</Label>
            <H1 className="mt-8">Build and own the systems your business runs on.</H1>
            <p className="mt-6 max-w-[680px] text-[16px] leading-[1.6] text-[var(--pg-body)] lg:text-[19px]">
              For business owners and operators who want ownership of their systems. You get your own server, code and data sovereignty, with our agentic team showing you what to do at every step.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Pill size="lg" onClick={goToApply}>
                {full ? 'Join the waitlist' : 'Apply for the next cohort'}
              </Pill>
              <TextLink onClick={() => scrollToId('the-30-days')}>See the 30 days</TextLink>
            </div>
            <p className="mt-6 text-[15px] text-[var(--pg-body)]">
              {startDate ? `Next cohort starts ${startDate}.` : 'The next start date is being confirmed.'}{' '}
              {full
                ? 'This run is full — join the waitlist and we will call you when a place opens.'
                : places ? `${places}.` : ''}
            </p>
          </div>

          {hasVideo ? (
            <VideoSlot url={FOUNDRY_VIDEO_URL} title="How Foundry works" sizeClassName="aspect-video" />
          ) : (
            <ChecklistCard label="Your Day-30 scorecard" title="Twenty checks. Every core one passes.">
              {SCORECARD_CHECKS.map((item) => (
                <CheckRow key={item}>{item}</CheckRow>
              ))}
            </ChecklistCard>
          )}
        </div>
      </section>

      {/* Ownership pillars */}
      <Section tone="alt" pad="tight">
        <div className="grid gap-x-[60px] gap-y-10 sm:grid-cols-3">
          {OWNERSHIP_PILLARS.map((pillar) => (
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
        <H2 tone="dark" className="mt-7 max-w-[850px] lg:text-[59px]">
          You do not need more information. You need to know what to do next.
        </H2>
        <p className="mt-6 max-w-[1000px] text-[18px] leading-[1.6] text-[var(--pg-dark-body)] lg:text-[22px]">
          AI made every tutorial free and every option visible. Most owner-operators are not short
          of knowledge. They are buried in tools, tabs and half-built projects. Foundry replaces the
          pile with one plan: three actions a week, a review on Friday, and a system that works at
          the end.
        </p>
      </Section>

      {/* The 30 days */}
      <Section id="the-30-days">
        <Label>The 30 days</Label>
        <H2 className="mt-7 max-w-[800px]">Four weeks, one finished system.</H2>
        <div className="mt-12 grid gap-[30px] sm:grid-cols-2 xl:grid-cols-4">
          {WEEKS.map((week) => (
            <StepCard
              key={week.label}
              label={week.label}
              title={week.title}
              body={week.body}
              doneLabel="Done when"
              doneText={week.doneText}
            />
          ))}
        </div>
      </Section>

      {/* What you get */}
      <Section id="what-you-get" tone="alt" pad="wide">
        <Label>What you get</Label>
        <H2 className="mt-7 max-w-[720px]">Training, tools and a person who keeps you moving.</H2>
        <div className="mt-12 grid gap-[30px] sm:grid-cols-2 lg:grid-cols-3">
          {DELIVERABLES.map((item) => (
            <FeatureCard key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </Section>

      {/* At day 30 */}
      <Section pad="default">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Label>At day 30</Label>
            <H2 className="mt-7 max-w-[640px]">You leave owning it, not renting it.</H2>
            <p className="mt-5 max-w-[620px] text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[22px]">
              Nothing you build is locked away. You choose what happens to the server, and your code
              and data are yours whichever way you go.
            </p>
          </div>
          <div className="rounded-[11px] bg-[var(--pg-card)] p-8 border border-[var(--pg-line-soft)] lg:p-10">
            <RowGroup>
              <CheckRow>Your code in a private repository under your own GitHub account</CheckRow>
              <CheckRow>Your database, with an export available at any time</CheckRow>
              <CheckRow>A one-page runbook: how to deploy, roll back, restore and get help</CheckRow>
              <CheckRow>
                Your choice on the server: continue with us, move it to your own account, or export
                and stop
              </CheckRow>
            </RowGroup>
          </div>
        </div>
      </Section>

      <FoundryApplySection onNavigate={onNavigate} />

      {/* Who it is for */}
      <Section id="who-it-is-for" tone="alt" pad="wide">
        <Label>Who it is for</Label>
        <H2 className="mt-7 max-w-[660px]">Built for people who ship.</H2>
        <div className="mt-12 grid gap-[30px] lg:grid-cols-2">
          <FitCard title="A good fit if you" compact>
            {GOOD_FIT.map((item) => (
              <CheckRow key={item}>{item}</CheckRow>
            ))}
          </FitCard>
          <FitCard title="Not the right fit if you" compact>
            <XRow>Want everything built for you with no learning</XRow>
            <XRow>Expect a guaranteed sales or revenue number</XRow>
            <XRow>Cannot commit the weekly time</XRow>
            <XRow>
              Are not technical yet. Try{' '}
              <button
                onClick={goToLaunchpad}
                className="font-medium text-[var(--pg-accent)] underline underline-offset-4 transition-opacity hover:opacity-75 cursor-pointer"
              >
                Breadmaker Launchpad
              </button>
              , our faster website track.
            </XRow>
          </FitCard>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" tone="white">
        <Label className="text-center">FAQ</Label>
        <H2 className="mx-auto mt-7 max-w-[720px] text-center">Questions before you apply.</H2>
        <div className="mt-10">
          <FaqBlock items={FAQS} className="mx-auto" />
        </div>
      </Section>

      <CtaBand
        heading={
          <>
            {startDate ? `Know exactly what to do next. Start on ${startDate}.` : 'Know exactly what to do next. Start with the next cohort.'}
          </>
        }
        ctaLabel={full ? 'Join the waitlist' : 'Apply for the next cohort'}
        onCta={goToApply}
      />

      <ProgramFooter
        onNavigate={onNavigate}
      />
    </div>
  );
}
