import { ProgramKey } from './program-config';

/**
 * What each program asks an applicant. Shared by the apply page (which renders
 * them) and the Studio queue (which reads the answers back), so a question is
 * added in one place and both follow.
 */

export type Question = {
  id: string;
  label: string;
  kind: 'text' | 'textarea' | 'select';
  options?: string[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  /** Only asked when this tier is chosen. */
  onlyTier?: string;
};

/** Where a Launchpad funnel is built. The apply wizard and the landing page render these as cards. */
export const FUNNEL_PLATFORMS = [
  {
    id: 'Shopify',
    title: 'Shopify',
    body: 'You sell products online. We build the funnel on a Shopify store.',
  },
  {
    id: 'WordPress',
    title: 'WordPress',
    body: 'You sell services, bookings or content. We build the funnel on a WordPress site.',
  },
  {
    id: 'Custom',
    title: 'Custom',
    body: 'You have your own site or app, or want one outside Shopify and WordPress.',
  },
] as const;

export function platformOf(id: string | undefined) {
  const wanted = (id ?? '').toLowerCase();
  return FUNNEL_PLATFORMS.find((platform) => platform.id.toLowerCase() === wanted);
}

export const QUESTIONS: Record<ProgramKey, Question[]> = {
  foundry: [
    {
      id: 'business',
      label: 'What do you sell, and to whom?',
      kind: 'textarea',
      placeholder: 'One paragraph is plenty. The offer, the buyer, and how people find you today.',
      required: true,
    },
    {
      id: 'outcome',
      label: 'What is the one number you want to move in 30 days?',
      kind: 'text',
      placeholder: 'e.g. 5 paying clients, or 20 qualified enquiries a month',
      required: true,
    },
    {
      id: 'built',
      label: 'Link to something you have built or run',
      kind: 'text',
      placeholder: 'A site, a repo, a product, a spreadsheet you live in',
      hint: 'Optional, but it tells us a lot about where you are starting from.',
    },
    {
      id: 'terminal',
      label: 'How comfortable are you with GitHub and a terminal?',
      kind: 'select',
      options: ['I use them most weeks', 'I can get by with instructions', 'Not yet, but I am willing to learn'],
      required: true,
    },
    {
      id: 'needs_built',
      label: 'What do you want us to build with you?',
      kind: 'textarea',
      placeholder: 'The backend, the automations, the parts you keep putting off — and anything already half-built.',
      onlyTier: 'done-with-you',
      required: true,
    },
    {
      id: 'anything',
      label: 'Anything else we should know?',
      kind: 'textarea',
      placeholder: 'Constraints, deadlines, a holiday in the middle of the month.',
    },
  ],
  launchpad: [
    {
      id: 'platform',
      label: 'Where should your funnel live?',
      kind: 'select',
      options: FUNNEL_PLATFORMS.map((platform) => platform.id),
      required: true,
    },
    {
      id: 'business',
      label: 'What do you sell?',
      kind: 'textarea',
      placeholder: 'The offer, who it is for, and how people hear about you today.',
      required: true,
    },
    {
      id: 'action',
      label: 'What should visitors do on your page?',
      kind: 'select',
      options: ['Enquire', 'Book a call', 'Pay me', 'Not sure yet'],
      required: true,
    },
    {
      id: 'format',
      label: 'What kind of funnel?',
      kind: 'select',
      options: ['Enquiry page', 'Scorecard quiz'],
      hint: 'A scorecard quiz scores each visitor and tells you who is ready now, who needs a nudge and who is early.',
    },
    {
      id: 'domain',
      label: 'Do you already have a domain name?',
      kind: 'select',
      options: ['Yes', 'No', 'Not sure'],
      required: true,
    },
    {
      id: 'domain_url',
      label: 'Your domain',
      kind: 'text',
      placeholder: 'yourdomain.com',
      hint: 'Optional. Asked only when you already have one.',
    },
    {
      id: 'needs_built',
      label: 'What do you want us to build for you?',
      kind: 'textarea',
      placeholder: 'The page itself, the booking or payment step, the follow-up messages.',
    },
    {
      id: 'anything',
      label: 'Anything else we should know?',
      kind: 'textarea',
      placeholder: 'Anything about your business, your audience or your timing.',
    },
  ],
};

/** The questions to ask for a program and tier. */
export function questionsFor(program: ProgramKey, tier: string): Question[] {
  return QUESTIONS[program].filter((question) => !question.onlyTier || question.onlyTier === tier);
}

/** Human label for a stored answer key, for the Studio queue. */
export function questionLabel(program: string, id: string): string {
  const list = QUESTIONS[program as ProgramKey] ?? [];
  return list.find((question) => question.id === id)?.label ?? id.replace(/_/g, ' ');
}
