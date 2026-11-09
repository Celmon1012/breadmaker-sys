import React, { useEffect, useState } from 'react';
import { Check, GitPullRequest, Inbox, LifeBuoy, MessageCircle, Server } from 'lucide-react';
import { Route } from '../types';
import { COMMUNITY_PRICE_USD, HubOffer, WAITLIST_MODE, getHubOffer } from '../lib/hub';
import { PARTNER_AGENT_BUDGET_USD, PARTNER_PRICE_USD, PARTNER_SEATS, PARTNER_UPTIME } from '../lib/prestige';
import { REPLY_TIME } from '../lib/program-config';
import HubCard from './lms/HubCard';
import HubWaitlistDialog from './HubWaitlistDialog';
import { BREADMAKER_THEME, CheckRow, FaqBlock, H1, H2, LeakTestBand, Label, Pill, RowGroup, Section, TextLink, scrollToId, themeStyle } from './program-ui';

interface HubPageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}


const PARTNER_PILLARS = [
  {
    icon: MessageCircle,
    title: 'A developer on WhatsApp',
    body: `Message your own developer to change code, fix bugs and ship updates on your repo. You get $${PARTNER_AGENT_BUDGET_USD} of usage each month.`,
  },
  {
    icon: Server,
    title: 'Hosted on your own server',
    body: `Your projects run on a dedicated server, set aside for you alone, monitored and backed up. Our uptime target is ${PARTNER_UPTIME} a month. If we miss it, you get a credit against that month's fee.`,
  },
  {
    icon: LifeBuoy,
    title: 'Priority support',
    body: 'Your tickets go to the top of the queue and are handled by our agentic team.',
  },
];

const STEPS = [
  { title: 'Apply', body: 'Tell us what you run. We read every application and reply by hand.' },
  { title: 'We set you up', body: 'We connect your repo, verify your WhatsApp number and move your project onto your own server.' },
  { title: 'Message us', body: 'Send a request on WhatsApp. Your developer opens a pull request. You approve it, and it goes live.' },
];

const WHO = [
  'You run a business that people depend on',
  'You value specialised skill, and the time it takes',
  'You would rather pay for a team behind your systems than patch them at midnight',
];

const FAQS = [
  {
    question: 'What is the Breadmaker Hub?',
    answer:
      'A private online hub, and an engineering partner on call. Breadmaker Community gets you in: the members-only room, the resources and the tools. Breadmaker Prestige adds a developer on WhatsApp, a dedicated server of your own and priority support.',
  },
  {
    question: 'What is the difference between Breadmaker Community and Breadmaker Prestige?',
    answer:
      'Breadmaker Community is open to anyone and costs less. Breadmaker Prestige is for the few who want us to run their systems. Places are limited, and we approve each one by hand.',
  },
  {
    question: 'Can the WhatsApp developer break my code or go live without me?',
    answer:
      'No. It works on a branch and opens a pull request. Nothing goes live until you approve it. It only touches the repositories you connect, and we can pause it at any time.',
  },
  {
    question: 'What does the usage allowance cover?',
    answer: `Each Prestige member gets $${PARTNER_AGENT_BUDGET_USD} of developer usage every month. It is enough for small, steady changes. When it runs out, the developer pauses until the next month, and you can ask us about a top-up.`,
  },
  {
    question: 'What is the uptime promise?',
    answer: `We aim for ${PARTNER_UPTIME} uptime each month on projects we host. If we fall short, you get a credit against that month's fee. It does not cover problems in your own code or outages at other providers.`,
  },
  {
    question: 'How does payment work?',
    answer: 'Breadmaker Community is a single payment of $97, and it is yours for good. Breadmaker Prestige is $300 a month, billed monthly once we approve you.',
  },
  {
    question: 'How do I join?',
    answer: `Join the Community waitlist, or apply for Prestige. We have ${PARTNER_SEATS} Prestige seats in this first group.`,
  },
];


function TierCard({ name, price, per, line, children, cta, featured = false }: { name: string; price: string; per: string; line: string; children: React.ReactNode; cta: React.ReactNode; featured?: boolean }) {
  return (
    <div className={`flex flex-col rounded-[22px] border p-8 lg:p-10 ${featured ? 'border-[var(--pg-ink)] bg-[var(--pg-card)]' : 'border-[var(--pg-line-soft)] bg-[var(--pg-card)]'}`}>
      <p className="font-label text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">{name}</p>
      <p className="mt-4 font-editorial text-[44px] font-bold leading-none tracking-[-0.02em]">
        {price}
        <span className="ml-1 text-[18px] font-medium text-[var(--pg-body)]">{per}</span>
      </p>
      <p className="mt-3 text-[16px] leading-[1.6] text-[var(--pg-body)]">{line}</p>
      <ul className="mt-6 space-y-3 text-[16px] leading-[1.5]">{children}</ul>
      <div className="mt-8 pt-2">{cta}</div>
    </div>
  );
}

const Item = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-3">
    <Check className="mt-1 h-5 w-5 shrink-0 text-[var(--pg-accent)]" aria-hidden="true" /> <span>{children}</span>
  </li>
);

export default function HubPage({ onNavigate, openPath }: HubPageProps) {
  const [offer, setOffer] = useState<HubOffer | null | undefined>(undefined);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const apply = () => openPath('/membership/apply');

  useEffect(() => {
    const previous = document.title;
    document.title = 'Membership | Breadmaker Systems';
    getHubOffer()
      .then(setOffer)
      .catch(() => setOffer(null));
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)]">
      <section>
        <div className="mx-auto max-w-[1312px] px-6 pb-20 pt-12 text-center lg:pb-28 lg:pt-16">
          <Label className="block">Breadmaker Hub</Label>
          <H1 className="mx-auto mt-5 max-w-[1000px]">A private online hub, and an engineering partner on call.</H1>
          <p className="mx-auto mt-6 max-w-[900px] text-[18px] leading-[1.6] text-[var(--pg-body)] lg:whitespace-nowrap lg:text-[22px]">
            You run a business that people depend on. We run the systems under it.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Pill size="lg" onClick={apply}>
              Apply for Prestige
            </Pill>
            <TextLink onClick={() => scrollToId('tiers')}>See both ways to join</TextLink>
          </div>
        </div>
      </section>

      <Section tone="alt">
        <Label>Breadmaker Prestige</Label>
        <H2 className="mt-7 max-w-[760px]">Your developer, your server and your inbox.</H2>
        <div className="mt-12 grid gap-[30px] md:grid-cols-3">
          {PARTNER_PILLARS.map((item) => (
            <div key={item.title} className="rounded-[22px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-8 lg:p-10">
              <item.icon className="mb-5 h-8 w-8 text-[var(--pg-accent)]" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="font-editorial text-[26px] font-semibold leading-[1.2] tracking-[-0.01em]">{item.title}</h3>
              <p className="mt-3 text-[16px] leading-[1.65] text-[var(--pg-body)]">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Label>How it works</Label>
            <H2 className="mt-7 max-w-[560px]">Message us. We ship it. You approve it.</H2>
            <ol className="mt-10 space-y-8">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--pg-ink)] text-[15px] font-semibold text-[var(--pg-bg)]">{index + 1}</span>
                  <div>
                    <p className="font-editorial text-[22px] font-semibold leading-[1.2]">{step.title}</p>
                    <p className="mt-1 max-w-[460px] text-[16px] leading-[1.6] text-[var(--pg-body)]">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[28px] border border-[var(--pg-line-soft)] bg-[var(--pg-card)] p-8 lg:p-10">
            <GitPullRequest className="h-8 w-8 text-[var(--pg-accent)]" strokeWidth={1.5} aria-hidden="true" />
            <h3 className="mt-5 font-editorial text-[26px] font-semibold leading-[1.2] tracking-[-0.01em]">Nothing goes live without you.</h3>
            <p className="mt-3 text-[16px] leading-[1.65] text-[var(--pg-body)]">
              Your developer works on a branch and opens a pull request. You approve it before it reaches your site. It only touches the repositories you connect, and we can pause it at any time.
            </p>
            <div className="mt-6">
              <RowGroup>
                {WHO.map((item) => (
                  <CheckRow key={item}>{item}</CheckRow>
                ))}
              </RowGroup>
            </div>
          </div>
        </div>
      </Section>

      <Section id="tiers" tone="alt">
        <Label>Two ways to join</Label>
        <H2 className="mt-7 max-w-[760px]">Start with the community, or get a team behind your systems.</H2>
        <div className="mt-12 grid items-stretch gap-[30px] lg:grid-cols-2">
          <TierCard
            name="Breadmaker Community"
            price={`$${COMMUNITY_PRICE_USD}`}
            per="one-time"
            line="The members-only room, and the tools behind the builds."
            cta={
              WAITLIST_MODE ? (
                <div>
                  <p className="mb-4 text-[15px] text-[var(--pg-body)]">Community opens soon.</p>
                  <Pill onClick={() => setWaitlistOpen(true)}>Join the waitlist</Pill>
                </div>
              ) : offer === undefined ? null : offer ? (
                <HubCard onNavigate={onNavigate} className="!p-0 !border-0 !bg-transparent" />
              ) : (
                <Pill onClick={() => onNavigate('contact')}>Get in touch</Pill>
              )
            }
          >
            <Item>Private WhatsApp community</Item>
            <Item>Every kit, free</Item>
            <Item>Templates, checklists and resources</Item>
            <Item>The internal tools we use to run our own systems</Item>
            <Item>{`Support, with a reply within ${REPLY_TIME}`}</Item>
          </TierCard>

          <TierCard
            featured
            name="Breadmaker Prestige"
            price={`$${PARTNER_PRICE_USD}`}
            per="/ month"
            line={`Everything in Breadmaker Community, and a team that runs your systems. ${PARTNER_SEATS} seats in this first group.`}
            cta={
              <div>
                <p className="mb-4 text-[15px] text-[var(--pg-body)]">We approve each Prestige member by hand.</p>
                <Pill onClick={apply}>Apply for Prestige</Pill>
              </div>
            }
          >
            <Item>Everything in Breadmaker Community</Item>
            <Item>{`A developer on WhatsApp, with $${PARTNER_AGENT_BUDGET_USD} of usage a month`}</Item>
            <Item>{`Hosting on your own dedicated server, with a ${PARTNER_UPTIME} uptime target`}</Item>
            <Item>Priority support</Item>
          </TierCard>
        </div>
      </Section>

      <Section id="faq" tone="white">
        <Label className="text-center">FAQ</Label>
        <H2 className="mx-auto mt-7 max-w-[720px] text-center">Questions before you join.</H2>
        <div className="mt-10">
          <FaqBlock items={FAQS} className="mx-auto" />
        </div>
      </Section>

      <LeakTestBand onNavigate={onNavigate} />

      <HubWaitlistDialog open={waitlistOpen} onClose={() => setWaitlistOpen(false)} />
    </div>
  );
}
