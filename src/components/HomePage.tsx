import React from 'react';
import { CircleCheck, KeyRound, Target } from 'lucide-react';
import VideoSlot from './VideoSlot';
import { describeVideo } from '../lib/lessonVideo';
import SiteHeader from './SiteHeader';
import { PROGRAM_SUMMARIES, ProgramSummaryCard } from './ProgramSummaryCards';
import { Route } from '../types';
import { useAuth } from '../context/AuthContext';
import { REPLY_TIME, VSL_TITLE, VSL_URL } from '../lib/program-config';
import {
  BREADMAKER_THEME,
  FOUNDRY_THEME,
  LAUNCHPAD_THEME,
  ProgramTheme,
  themeStyle,
  ProgramFooter,
  Section,
  Label,
  H1,
  H2,
  Pill,
  TextLink,
  RowGroup,
  CheckRow,
  StepCard,
  FaqBlock,
  LeakTestBand,
  scrollToId,
} from './program-ui';

/**
 * Breadmaker Systems homepage: the umbrella over the two programs.
 * Uses the same editorial system as the Foundry and Launchpad landing pages,
 * and routes visitors to the program that fits them (Launchpad for
 * non-technical owners, Foundry for technical-leaning owner-operators).
 */

interface HomePageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

const PRINCIPLES = [
  {
    icon: Target,
    title: 'One next action',
    body: 'You always know the one thing to do today. Guidance, not another pile of tutorials.',
  },
  {
    icon: CircleCheck,
    title: 'Done means done',
    body: 'Every step has a clear definition of done, and we record it, so progress is never a guess.',
  },
  {
    icon: KeyRound,
    title: 'Yours to keep',
    body: 'Your domain, your content, your data. Nothing you build is locked away.',
  },
];


const PATH_GUIDE: { situation: string; label: string; route: Route }[] = [
  { situation: 'I do not know what is costing my business the most.', label: 'Take the free Leak Test', route: 'leak-test' },
  { situation: 'I am not technical and want a working funnel live in a week.', label: 'See Launchpad', route: 'launchpad' },
  { situation: 'I want to own my code, server and data.', label: 'See Foundry', route: 'foundry' },
  { situation: 'People depend on my business and I want an agentic team on call.', label: 'See Prestige', route: 'membership' },
];

const RHYTHM = [
  {
    label: 'Monday',
    title: 'The plan',
    body: 'You get this week’s actions, each with a clear definition of done. No tool hunting, no guessing what comes next.',
  },
  {
    label: 'Midweek',
    title: 'The nudge',
    body: 'We check in and ask what is stuck. Reply with the blocker and get an answer the same day.',
  },
  {
    label: 'Friday',
    title: 'The review',
    body: 'We look at what shipped, mark what is done, clear what got in the way, and set the next step.',
  },
];


const FAQS = [
  {
    question: 'Is Breadmaker only about websites and funnels?',
    answer:
      'No. Breadmaker is for people who provide for others, and we list any system that has been tested and proven to do one specific job. Websites and funnels are the first shelf. Others, such as offer, sales, cash and delivery systems, are available as kits while we write up the record of running each one ourselves. They are marked as such, and a system is called live only once that record is published.',
  },
  {
    question: 'What does proven mean?',
    answer:
      'We run the system ourselves first, state the outcome up front, keep a written record of what happened, and name the risks on the page. Proven means it runs as specified. It does not mean it earns, and we never promise earnings.',
  },
  {
    question: 'Which program should I choose?',
    answer:
      'If you are not technical and want a working funnel quickly, choose Launchpad. If you are comfortable with GitHub and a terminal and want to own a full system, from data to payments to automation, choose Foundry. Not sure? Contact us and we will point you to the right one.',
  },
  {
    question: 'Can I start with Launchpad and move to Foundry later?',
    answer:
      'Yes. Launchpad gets you live and taking enquiries. When you want to own your code and server, Foundry is the next step.',
  },
  {
    question: 'What if I want you to build the hard parts?',
    answer:
      'Both builds are done with you: we build the hard parts alongside you, so you are not left to figure it out alone. You apply or reserve your build spot, then pay to hold your place.',
  },
  {
    question: 'Do I own what I build?',
    answer:
      'Yes. Your content, domain and data are yours in both programs. On Foundry your code lives in your own GitHub account from day 1, and your database can be exported at any time.',
  },
  {
    question: 'Do you guarantee sales?',
    answer:
      'No. We commit to a working system and to keeping you moving. What it earns depends on your offer, your market and your effort.',
  },
  {
    question: 'Who is behind Breadmaker?',
    answer:
      'Breadmaker Systems is run by Restart Inc., a team that builds and operates these systems itself before teaching them.',
  },
];


export default function HomePage({ onNavigate, openPath }: HomePageProps) {
  const { session } = useAuth();
  // The hero video appears only once a usable link is set; until then the hero stands alone.
  const hasVideo = describeVideo(VSL_URL).kind === 'embed';

  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="min-h-screen bg-[var(--pg-bg)] font-inter antialiased">
      <SiteHeader onNavigate={onNavigate} />

      {/* Hero */}
      <section className="bg-[var(--pg-bg)]">
        <div className={`mx-auto grid max-w-[1312px] items-center gap-14 px-6 pb-20 pt-10 lg:pb-[106px] lg:pt-[66px] ${hasVideo ? 'lg:grid-cols-[1.38fr_1fr]' : ''}`}>
          <div>
            <Label>For anyone who provides for others</Label>
            <H1 className="mt-3 max-w-[720px]"><span className="block">We help provide the</span> <span className="block">working systems and</span> <span className="block">support you need<span className="-ml-[0.14em]">.</span></span></H1>
            <p className="mt-6 max-w-[630px] text-[16px] leading-[1.6] text-[var(--pg-body)] lg:text-[19px]">
              Each system is proven to solve one specific problem before we set it up with you. Then we stay with you until it works.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Pill size="lg" onClick={() => scrollToId('programs')}>
                Choose your path
              </Pill>
              <TextLink onClick={() => onNavigate('about')}>Find out more</TextLink>
            </div>
          </div>

          {hasVideo && <VideoSlot url={VSL_URL} title={VSL_TITLE} sizeClassName="aspect-video lg:aspect-auto lg:h-[500px]" />}
        </div>
      </section>

      {/* Principles */}
      <Section tone="alt" pad="tight">
        <div className="grid gap-x-[60px] gap-y-10 sm:grid-cols-3">
          {PRINCIPLES.map((item) => (
            <div key={item.title}>
              <item.icon className="h-7 w-7 text-[var(--pg-accent)]" strokeWidth={1.5} aria-hidden />
              <h3 className="mt-5 font-editorial text-[22px] font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--pg-ink)]">
                {item.title}
              </h3>
              <p className="mt-2 max-w-[340px] text-[16px] leading-[1.6] text-[var(--pg-body)]">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* The problem */}
      <Section tone="dark" pad="loose">
        <Label tone="dark">The problem</Label>
        <H2 tone="dark" className="mt-7 max-w-[850px] lg:text-[59px]">
          You need a system that works more than another new idea.
        </H2>
        <p className="mt-6 max-w-[1000px] text-[18px] leading-[1.6] text-[var(--pg-dark-body)] lg:text-[22px]">
          Every week there is a new way to earn: a strategy, a bot, an agent, a course. Most are untested, and people who provide for others cannot afford to be the test. We run each system ourselves first, keep the record, and only then teach it.
        </p>
      </Section>

      {/* The programs */}
      <Section id="programs">
        <Label>How to get started</Label>
        <H2 className="mt-7 max-w-[760px]">Start with the path that fits.</H2>
        <p className="mt-5 max-w-[680px] text-[18px] leading-[1.6] text-[var(--pg-body)]">
          Launchpad and Foundry are two system paths we have tested and validated, both for building the right foundation for your own online business and revenue.
        </p>
        <div className="mt-12 grid gap-[30px] lg:grid-cols-2">
          {PROGRAM_SUMMARIES.map((program) => (
            <ProgramSummaryCard
              key={program.route}
              program={program}
              onNavigate={onNavigate}
              openPath={openPath}
            />
          ))}
        </div>
        <div className="mt-14 rounded-[17px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-8 lg:p-10">
          <Label>Still deciding?</Label>
          <h3 className="mt-4 font-editorial text-[26px] font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--pg-ink)]">Match your situation to a starting point.</h3>
          <RowGroup className="mt-6">
            {PATH_GUIDE.map((item) => (
              <div key={item.route} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
                <p className="max-w-[560px] text-[17px] leading-[1.5] text-[var(--pg-ink)]">{item.situation}</p>
                <TextLink onClick={() => onNavigate(item.route)}>{item.label}</TextLink>
              </div>
            ))}
          </RowGroup>
        </div>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" pad="wide" className="pt-6! lg:pt-6!">
        <Label>How it works</Label>
        <H2 className="mt-7 max-w-[760px]">The same rhythm, every week.</H2>
        <p className="mt-5 max-w-[680px] text-[18px] leading-[1.6] text-[var(--pg-body)]">
          Guidance beats information. Each step ends with one action and a clear definition of done,
          and our agentic team keeps you moving.
        </p>
        <div className="mt-12 grid gap-[30px] md:grid-cols-3">
          {RHYTHM.map((step) => (
            <StepCard key={step.label} label={step.label} title={step.title} body={step.body} />
          ))}
        </div>
      </Section>

      {/* Ownership and promise */}
      <Section tone="alt" pad="default">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Label>Our promise</Label>
            <H2 className="mt-7 max-w-[640px]">We promise a working system, not a sales number.</H2>
            <p className="mt-5 max-w-[620px] text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[22px]">
              Do your part each week and we stay with you until what we agreed is live and working.
              What it earns depends on your offer, your market and your effort.
            </p>
          </div>
          <div className="rounded-[11px] bg-[var(--pg-card)] p-8 border border-[var(--pg-line-soft)] lg:p-10">
            <RowGroup>
              <CheckRow>Your domain, your content and your data, in both programs</CheckRow>
              <CheckRow>A clear definition of done for every step, recorded as you go</CheckRow>
              <CheckRow>{`Support that answers within ${REPLY_TIME}`}</CheckRow>
              <CheckRow>If it is not working at the end, we keep going until it is</CheckRow>
            </RowGroup>
          </div>
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

      <LeakTestBand onNavigate={onNavigate} />

      <ProgramFooter
        onNavigate={onNavigate}
      />
    </div>
  );
}
