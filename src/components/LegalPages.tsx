import React from 'react';
import { Route } from '../types';
import { BREADMAKER_THEME, Label, themeStyle } from './program-ui';

/**
 * Terms of Service and Privacy Policy. The wording follows the previous legal
 * pages; only the product references were updated to the current programs
 * (Launchpad, Foundry, Breadmaker Academy). Have counsel review before relying on it.
 */

interface LegalSection {
  title: string;
  paragraphs?: React.ReactNode[];
  list?: React.ReactNode[];
  after?: React.ReactNode[];
}

const PRIVACY_EMAIL = <a href="mailto:privacy@restart.ng" className="font-medium text-[var(--pg-accent)] underline underline-offset-4">privacy@restart.ng</a>;
const LEGAL_EMAIL = <a href="mailto:legal@restart.ng" className="font-medium text-[var(--pg-accent)] underline underline-offset-4">legal@restart.ng</a>;

const PRIVACY: LegalSection[] = [
  {
    title: 'Who we are',
    paragraphs: [
      <>Breadmaker Systems is operated by <strong>Restart Integrated Systems Ltd. (Restart Inc.)</strong>, a digital services company based in Lagos, Nigeria. When you interact with our website, programs or Breadmaker Academy, Restart Inc. acts as the data controller responsible for your information.</>,
      <>If you have questions about how we handle your data, contact us at {PRIVACY_EMAIL}.</>,
    ],
  },
  {
    title: 'What we collect',
    paragraphs: ['We collect information you provide directly when you:'],
    list: [
      'Apply for Breadmaker Foundry or reserve a Launchpad build spot (name, email, business details, your answers)',
      'Create a Breadmaker Academy account (name, email, and optionally a phone number)',
      'Use the Academy (the sessions you complete and your progress)',
      'Contact us through the contact form, email or any other channel',
      'Sign up for our email updates on a guide or the Tools page (your email address, and the page you signed up from)',
      'Take the Business Leak Test (your answers to the five business profile questions and the thirty scored questions, plus your name, email and WhatsApp number, which you give us to see your result)',
    ],
    after: [
      'We also collect limited technical data automatically, including your IP address, browser type, pages visited and time of visit, via standard web analytics.',
    ],
  },
  {
    title: 'How we use your information',
    paragraphs: ['We use the information we collect to:'],
    list: [
      'Review your application and run the program you enrolled in',
      'Work out your Business Leak Test result, send it to you, unlock your report, and compare results anonymously in aggregate so we can show how businesses like yours score',
      'Give you access to your courses and keep your progress',
      'Communicate with you about your enrollment, including weekly plans, nudges and reviews',
      'Send you the guides and updates you signed up for, if you ticked the box to receive them',
      'Improve our website, programs and services',
      'Manage our internal CRM and project records',
      'Comply with legal obligations',
    ],
    after: ['We do not use your data for automated decision-making that produces legal or similarly significant effects.'],
  },
  {
    title: 'WhatsApp and SMS communication',
    paragraphs: [
      'If you give us your phone number, you consent to receive messages from us via WhatsApp and/or SMS related to your application, enrollment or Business Leak Test result, such as reminders, the midweek check-in and follow-ups about your result.',
      'You can opt out at any time by replying "STOP" or contacting us directly.',
    ],
  },
  {
    title: 'Who we share your data with',
    paragraphs: [
      'We do not sell, rent or trade your personal information. We may share data with trusted service providers who help us operate our services, including:',
    ],
    list: [
      <><strong>Supabase</strong>: accounts, course progress and form data storage</>,
      <><strong>Web analytics providers</strong>: website analytics</>,
      <><strong>WhatsApp / Evolution API</strong>: message delivery</>,
      <><strong>Email service providers</strong>: notifications and program emails</>,
      <><strong>Flutterwave</strong>: payment processing for programs and reports</>,
      <><strong>Automation tools (n8n)</strong>: sending your result follow-ups by email and WhatsApp</>,
      <><strong>Kumoda</strong>: our contact, messaging and email platform, which stores your contact details and sends the emails you asked for</>,
      <><strong>Hosting and code hosting providers</strong>: for Foundry enrollees, the servers and repositories set up for your project</>,
    ],
    after: ['All processors are required to handle your data in accordance with applicable data protection laws, including the Nigeria Data Protection Act.'],
  },
  {
    title: 'Email updates and guides',
    paragraphs: [
      'If you sign up for our emails on a guide or the Tools page, you tick a box first. We store your email address and the page you signed up from, and we send you short emails with guides and updates. We do not send these to people who have not ticked that box, and taking the Business Leak Test does not sign you up for them.',
      'Every email has an unsubscribe link. Using it stops our emails to you straight away. You can also email us and we will remove you by hand.',
    ],
  },
  {
    title: 'The Business Leak Test',
    paragraphs: [
      'You tick a consent box before you see your result. We store your answers and contact details so you can return to your result and report. Your answers are never shown to other people. Benchmarks use only combined, anonymous averages.',
      'The test is a self-assessment, not a financial or legal audit. A payment for the full report is processed by Flutterwave; we do not see or store your card details. You can ask us to delete your result and details at any time.',
    ],
  },
  {
    title: 'Data retention',
    paragraphs: [
      'We retain your personal data for as long as necessary to fulfil the purpose for which it was collected, or as required by law. If you enroll, we retain records for the duration of the program and for a reasonable period thereafter for legal and accounting purposes.',
      'You can request deletion of your data at any time (see "Your rights").',
    ],
  },
  {
    title: 'Cookies and tracking',
    paragraphs: [
      'Our website uses cookies and similar technologies to keep you signed in and to understand how visitors use the site. You can control cookie preferences through your browser settings.',
      'We do not use tracking for advertising retargeting at this time.',
    ],
  },
  {
    title: 'Your rights',
    paragraphs: ['You have the right to:'],
    list: [
      'Access the personal data we hold about you',
      'Request correction of inaccurate data',
      'Request deletion of your data',
      'Withdraw consent for communications at any time',
      'Object to how we process your data',
    ],
    after: [<>To exercise any of these rights, email us at {PRIVACY_EMAIL}. We will respond within 30 days.</>],
  },
  {
    title: 'Security',
    paragraphs: [
      'We take reasonable technical and organisational measures to protect your personal data against unauthorised access, loss or disclosure. However, no system is completely secure, and we cannot guarantee absolute security.',
    ],
  },
  {
    title: 'Changes to this policy',
    paragraphs: [
      'We may update this policy from time to time. Changes will be posted to this page with an updated date. Continued use of our services after changes are published constitutes acceptance of the revised policy.',
    ],
  },
];

const TERMS: LegalSection[] = [
  {
    title: 'Agreement to terms',
    paragraphs: [
      'By accessing or using Breadmaker Systems (operated by Restart Integrated Systems Ltd., "Restart Inc."), you agree to be bound by these Terms of Service. If you do not agree, please do not use our services.',
      'These terms apply to all visitors, applicants, learners and clients, and anyone who interacts with our website, Breadmaker Academy or any service we provide.',
    ],
  },
  {
    title: 'Services',
    paragraphs: [
      'Breadmaker Systems runs guided build programs, Breadmaker Launchpad and Breadmaker Foundry, and the Breadmaker Academy learning platform. Program deliverables, timelines, fees, refunds and guarantees are set out in the enrollment terms you accept when you enroll.',
      'Free previews, the contact form and build spot reservations are provided as-is and do not constitute a binding contract or guarantee of service.',
    ],
  },
  {
    title: 'Your account',
    paragraphs: [
      'You are responsible for keeping your Academy login secure and for activity under your account. Course access is personal to you and may not be shared.',
    ],
  },
  {
    title: 'Use of our website and tools',
    paragraphs: ['You agree to use our website and tools only for lawful purposes. You must not:'],
    list: [
      'Submit false, misleading or fraudulent information in any form',
      'Attempt to access, copy or reverse-engineer any part of our systems',
      'Use automated tools to scrape, crawl or harvest data from our site',
      'Interfere with the security or performance of our infrastructure',
    ],
  },
  {
    title: 'Intellectual property',
    paragraphs: [
      'All content on this website and in Breadmaker Academy, including copy, design, course materials, templates and frameworks, is the intellectual property of Restart Inc. unless otherwise stated. You may not reproduce, distribute or create derivative works without written permission.',
      'Code and data you create for your own business during a program belong to you, as described in your enrollment terms.',
    ],
  },
  {
    title: 'No guarantees',
    paragraphs: [
      'We provide our services with care and expertise, but we cannot guarantee specific revenue outcomes, cost savings or business results. What a system earns depends on your offer, your market and your effort.',
      'Any projections, estimates or examples we share are illustrative, not contractual commitments.',
    ],
  },
  {
    title: 'Limitation of liability',
    paragraphs: [
      'To the maximum extent permitted by law, Restart Inc. and Breadmaker Systems will not be liable for any indirect, incidental or consequential damages arising from your use of our services or website, including but not limited to lost revenue, data loss or business interruption.',
      'Our total liability for any claim related to our services shall not exceed the amount paid by you for the specific service giving rise to the claim.',
    ],
  },
  {
    title: 'Third-party services',
    paragraphs: [
      'We use and may recommend third-party tools and platforms (for example hosting, code hosting, payment providers and AI tools). We are not responsible for the performance, availability or terms of those services. Any relationship you form with third-party vendors is your own.',
    ],
  },
  {
    title: 'Changes to these terms',
    paragraphs: [
      'We may update these terms from time to time. Changes take effect when posted to this page. Continued use of our services after changes are published constitutes your acceptance of the updated terms.',
    ],
  },
  {
    title: 'Governing law',
    paragraphs: [
      'These terms are governed by the laws of the Federal Republic of Nigeria. Any disputes will be subject to the exclusive jurisdiction of courts in Lagos, Nigeria.',
    ],
  },
];

const DPA: LegalSection[] = [
  {
    title: 'Purpose and scope',
    paragraphs: [
      'This addendum applies when Restart Integrated Systems Ltd. ("Restart", "we") processes personal data on your behalf. The usual case is enquiries that people submit through a funnel we build or host for you: for that data you are the controller and we are the processor.',
      'It does not cover personal data that we collect and decide how to use for ourselves, such as your own account details or applications. That is covered by our Privacy Policy.',
    ],
  },
  {
    title: 'What we process',
    list: [
      'Categories of people: the visitors and customers who use your funnel',
      'Categories of data: names, email addresses, phone or WhatsApp numbers, and the answers a person gives in your forms and scorecards',
      'Purpose: to deliver each enquiry to you, to keep a record of it for you, and to carry out the follow-up you ask us to set up',
    ],
  },
  {
    title: 'What we commit to',
    paragraphs: ['When we process personal data on your behalf, we will:'],
    list: [
      'Process it only to provide the service and on your documented instructions, including those in your build brief',
      'Make sure the people who can access it are bound by confidentiality',
      'Keep it secure with reasonable technical and organisational measures',
      'Help you answer requests from people exercising their data protection rights',
      'Tell you without undue delay if we become aware of a breach that affects your data',
      'Delete or return it when the service ends, if you ask us to in writing',
    ],
  },
  {
    title: 'Service providers',
    paragraphs: [
      'We use service providers to host, store and deliver the service. They are listed under "Who we share your data with" in our Privacy Policy. We keep that list current and ask each provider to protect personal data to a standard no lower than this addendum.',
    ],
  },
  {
    title: 'Where data is processed',
    paragraphs: [
      'We are based in Lagos, Nigeria, and some of our providers process data in other countries. We handle transfers in line with the Nigeria Data Protection Act.',
    ],
  },
  {
    title: 'Retention and deletion',
    paragraphs: [
      'We keep your enquiry data for as long as the service runs, or as you instruct. At your written request, we delete or return it within 30 days, unless the law requires us to keep it.',
    ],
  },
  {
    title: 'Your responsibilities',
    paragraphs: [
      'As the controller you are responsible for having a lawful basis to collect the data through your funnel, for telling people how you use it, and for the instructions you give us.',
    ],
  },
];

function LegalLayout({
  current,
  title,
  sections,
  contact,
  onNavigate,
}: {
  current: 'terms' | 'privacy' | 'dpa';
  title: string;
  sections: LegalSection[];
  contact: React.ReactNode;
  onNavigate: (route: Route) => void;
}) {
  return (
    <div style={themeStyle(BREADMAKER_THEME)} className="bg-[var(--pg-bg)] font-inter text-[var(--pg-ink)]">
      <div className="mx-auto max-w-[1312px] px-6 pb-24 pt-12 lg:pt-16">
        <Label>Legal</Label>
        <h1 className="mt-6 font-editorial text-[36px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[46px]">{title}</h1>
        <p className="mt-4 text-[15px] text-[var(--pg-body)]">Last updated: October 2026</p>

        <div className="mt-12 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-16">
          <nav className="flex gap-2 lg:sticky lg:top-28 lg:h-fit lg:flex-col" aria-label="Legal pages">
            {([
              ['terms', 'Terms of Service'],
              ['privacy', 'Privacy Policy'],
              ['dpa', 'Data Processing Addendum'],
            ] as const).map(([route, label]) => (
              <button
                key={route}
                onClick={() => onNavigate(route)}
                aria-current={current === route ? 'page' : undefined}
                className={`rounded-full px-5 py-2.5 text-left text-[14.5px] transition-colors cursor-pointer ${
                  current === route ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'hover:bg-[var(--pg-alt)]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <article className="max-w-[760px] rounded-[11px] bg-[var(--pg-card)] p-7 border border-[var(--pg-line-soft)] sm:p-12">
            {sections.map((section, index) => (
              <section key={section.title} className={index ? 'mt-10 border-t border-[var(--pg-line-soft)] pt-10' : ''}>
                <h2 className="font-editorial text-[24px] font-semibold leading-[1.2] tracking-[-0.01em]">
                  {index + 1}. {section.title}
                </h2>
                <div className="mt-4 space-y-4 text-[16px] leading-[1.7] text-[var(--pg-body)]">
                  {section.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
                  {section.list && (
                    <ul className="list-disc space-y-2 pl-5 marker:text-[var(--pg-accent)]">
                      {section.list.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  )}
                  {section.after?.map((p, i) => <p key={i}>{p}</p>)}
                </div>
              </section>
            ))}
            <div className="mt-12 rounded-[12px] bg-[var(--pg-alt)] p-6 text-[15.5px] leading-[1.6]">{contact}</div>
          </article>
        </div>
      </div>
    </div>
  );
}

export function PrivacyPage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  return (
    <LegalLayout
      current="privacy"
      title="Privacy Policy"
      sections={PRIVACY}
      onNavigate={onNavigate}
      contact={<><strong>Data and privacy enquiries:</strong> email {PRIVACY_EMAIL}. We aim to respond within 2 business days.</>}
    />
  );
}

export function DpaPage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  return (
    <LegalLayout
      current="dpa"
      title="Data Processing Addendum"
      sections={DPA}
      onNavigate={onNavigate}
      contact={<><strong>Need a signed copy, or have questions?</strong> Email {LEGAL_EMAIL}. For data requests, email {PRIVACY_EMAIL}.</>}
    />
  );
}

export function TermsPage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  return (
    <LegalLayout
      current="terms"
      title="Terms of Service"
      sections={TERMS}
      onNavigate={onNavigate}
      contact={<><strong>Questions about these terms?</strong> Email {LEGAL_EMAIL}.</>}
    />
  );
}
