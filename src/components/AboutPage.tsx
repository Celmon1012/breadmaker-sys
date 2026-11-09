import React from 'react';
import { Route } from '../types';
import { BREADMAKER_THEME, CheckRow, LeakTestBand, H1, H2, Label, RowGroup, Section, themeStyle } from './program-ui';

interface AboutPageProps {
  onNavigate: (route: Route) => void;
}

const PRINCIPLES = [
  {
    title: 'One next action at a time',
    body: 'People who come to us are rarely short of information. They are buried in it. So every step we give you ends with one action and a clear definition of done.',
  },
  {
    title: 'Completion is recorded',
    body: 'We write down what got done, week by week. It keeps progress honest, and it is how we stand behind our promise to keep working until what we agreed works.',
  },
  {
    title: 'You own what you build',
    body: 'Your domain, your content, your code and your data stay yours. Nothing you build with us is locked away.',
  },
  {
    title: 'Proven before listed',
    body: 'We run each system ourselves, state the outcome, keep the record and name the risks before we teach it. Where money can be lost, we say so. We never promise earnings.',
  },
];

export default function AboutPage({ onNavigate }: AboutPageProps) {
  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)]">
      <section>
        <div className="mx-auto max-w-[1312px] px-6 pb-20 pt-12 lg:pb-28 lg:pt-16">
          <Label>About Breadmaker</Label>
          <H1 className="mt-5 max-w-[860px]">Why we exist</H1>
          <p className="mt-6 max-w-[730px] text-pretty text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[20px]">
            You provide for others. You can’t afford to keep testing what works.
          </p>
          <p className="mt-5 max-w-[730px] text-pretty tracking-[-0.012em] text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[20px]">
            That’s where my team and I come in. At Restart Inc., we build and test systems every day, so you don’t have to. Each system is proven to solve one specific problem before we set it up with you. Then we stay with you until it works.
          </p>
          <p className="mt-5 max-w-[730px] text-pretty text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[20px]">
            You get working systems and real support, without the guesswork.
          </p>
          <p className="mt-5 max-w-[730px] text-pretty text-[18px] leading-[1.6] text-[var(--pg-body)] lg:text-[20px]">
            You deserve both.
          </p>
        </div>
      </section>

      <Section tone="dark" pad="loose">
        <Label tone="dark">Where we started</Label>
        <H2 tone="dark" className="mt-7 max-w-[900px]">New ways to earn appear every week. It is hard to know which ones work.</H2>
        <p className="mt-6 max-w-[900px] text-[18px] leading-[1.6] text-[var(--pg-dark-body)] lg:text-[20px]">
          You should not have to be the test. So we run each system ourselves, keep the record and only then teach it to you. Every week follows the same short path. Three actions, a midweek check-in and a Friday review.
        </p>
      </Section>

      <Section id="principles">
        <Label>How we work</Label>
        <H2 className="mt-7 max-w-[760px]">Four principles behind every system.</H2>
        <div className="mt-12 grid gap-[30px] md:grid-cols-2">
          {PRINCIPLES.map((item) => (
            <div key={item.title} className="rounded-[17px] bg-[var(--pg-card)] p-8 border border-[var(--pg-line-soft)] lg:p-10">
              <h3 className="font-editorial text-[26px] font-semibold leading-[1.2] tracking-[-0.01em]">{item.title}</h3>
              <p className="mt-3 text-[16px] leading-[1.65] text-[var(--pg-body)]">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="alt">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Label>Who is behind it</Label>
            <H2 className="mt-7 max-w-[640px]">Built by the team that runs the same stack for its own clients.</H2>
            <p className="mt-5 max-w-[620px] text-[18px] leading-[1.6] text-[var(--pg-body)]">
              Breadmaker Systems is a program of Restart Integrated Systems Ltd. (Restart Inc.),
              based in Lagos, Nigeria. The systems we teach are ones we run ourselves first.
            </p>
          </div>
          <div className="rounded-[11px] bg-[var(--pg-card)] p-8 border border-[var(--pg-line-soft)] lg:p-10">
            <RowGroup>
              <CheckRow>
                <button onClick={() => onNavigate('launchpad')} className="text-left hover:underline cursor-pointer">
                  <strong>Breadmaker Launchpad</strong>: a working page live in days, for non-technical owners
                </button>
              </CheckRow>
              <CheckRow>
                <button onClick={() => onNavigate('foundry')} className="text-left hover:underline cursor-pointer">
                  <strong>Breadmaker Foundry</strong>: a 30-day build of a system you own, for technical owners
                </button>
              </CheckRow>
            </RowGroup>
          </div>
        </div>
      </Section>

      <Section tone="white">
        <Label>Where the proof comes from</Label>
        <H2 className="mt-7 max-w-[820px]">Proven in real client work.</H2>
        <p className="mt-5 max-w-[720px] text-[18px] leading-[1.6] text-[var(--pg-body)]">
          Breadmaker is the personal brand of Ademola Usuf, Technical Founder of Restart Inc.
          Restart builds and operates live systems for paying clients: websites, payment flows, automation and the data behind them.
          Breadmaker takes the patterns that hold up in that work and writes them into builds an owner can understand, run and keep.
        </p>
        <div className="mt-12 max-w-[820px] rounded-[17px] bg-[var(--pg-card)] p-8 border border-[var(--pg-line-soft)] lg:p-10">
          <h3 className="font-editorial text-[26px] font-semibold leading-[1.2] tracking-[-0.01em]">The systems: proven</h3>
          <p className="mt-3 text-[16px] leading-[1.65] text-[var(--pg-body)]">
            The systems themselves run in Restart client deployments that are live today and paid for. That is where we learn what breaks, what lasts and what a business can maintain. Client details stay private.
          </p>
          <p className="mt-3 text-[16px] leading-[1.65] text-[var(--pg-body)]">
            Proven means the system runs as specified. It does not mean it earns.
          </p>
        </div>
      </Section>

      <LeakTestBand onNavigate={onNavigate} />
    </div>
  );
}
