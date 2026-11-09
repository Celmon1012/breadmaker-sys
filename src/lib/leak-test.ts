/**
 * "Where is your business leaking?" A 30-question self-assessment: five
 * questions in each of six pillars, answered Never to Always (0-4 points).
 */

export interface LeakArea {
  id: string;
  name: string;
  tagline: string;
  questions: string[];
  /** The one thing to do first if this is the weakest pillar. */
  firstFix: string;
}

export const LEAK_AREAS: LeakArea[] = [
  {
    id: 'offer',
    name: 'Offer & Positioning',
    tagline: 'Clear, priced, focused',
    questions: [
      'I can state in one sentence who I serve and what result I deliver.',
      'Customers know why to pick me over the alternatives.',
      'My prices come from calculated costs and value, not guesswork.',
      "I turn down customers who aren't a good fit.",
      'Most of my revenue comes from a defined offer, not random one-off requests.',
    ],
    firstFix:
      'Write your offer in one sentence: who it is for, what they get and the price. Put it at the top of your page and your messages.',
  },
  {
    id: 'sales',
    name: 'Sales & Lead Flow',
    tagline: 'Leads that arrive and convert',
    questions: [
      'I know where my last 10 customers came from.',
      'At least one channel brings me leads every week without me chasing.',
      'I follow up every lead within 24 hours.',
      'I track how many enquiries become paying customers.',
      'Repeat buyers and referrals are a meaningful share of my sales.',
    ],
    firstFix:
      'For two weeks, answer every enquiry within a day and keep a simple list of each one and what happened. You cannot fix a leak you cannot see.',
  },
  {
    id: 'operations',
    name: 'Operations & Systems',
    tagline: "Delivery that doesn't depend on memory",
    questions: [
      'My core delivery process is written down.',
      'Quality is consistent no matter who handles the job.',
      'Orders and tasks are tracked in a system, not in memory or chat scrollback.',
      'Complaints are logged and the root cause is fixed.',
      "The business keeps running when I'm away for a week.",
    ],
    firstFix:
      'Write down the five steps you do for every customer, in order. That list is your first system, and everything else gets built on it.',
  },
  {
    id: 'cash',
    name: 'Finance & Cash',
    tagline: 'Profit you can actually see',
    questions: [
      'Business money and personal money are separate.',
      'I know my monthly profit, not just my revenue.',
      'I hold a cash buffer of at least one month of costs.',
      'I invoice on time and chase late payments consistently.',
      'I know the cost to deliver each product or service.',
    ],
    firstFix:
      'Keep business money in its own account. Every Friday, write down money in, money out and what you are still owed.',
  },
  {
    id: 'team',
    name: 'Team & Owner Dependence',
    tagline: 'A business that runs without you',
    questions: [
      'Everyone, including me, has clear responsibilities.',
      'At least one function is fully delegated.',
      "Routine decisions don't need me.",
      'I could onboard a new hire using existing materials.',
      'I spend most of my time on growth, not firefighting.',
    ],
    firstFix:
      'List the three tasks only you do. Write instructions for one of them and hand it off this month.',
  },
  {
    id: 'tech',
    name: 'Tech & Automation',
    tagline: 'Automated, backed up, safe',
    questions: [
      'Customers can find me and pay me online easily.',
      'I use a business domain and email, not a free email address.',
      'Repetitive tasks such as invoices, reminders and replies are automated.',
      'Customer data lives in one place and is backed up.',
      'I collect and store customer data with consent and basic protection (NDPA-aware).',
    ],
    firstFix:
      'Move your domain and key accounts under your own login, turn on two-step sign-in, then test your payment or enquiry form from start to finish.',
  },
];

export const ANSWERS = [
  { label: 'Never', points: 0 },
  { label: 'Rarely', points: 1 },
  { label: 'Sometimes', points: 2 },
  { label: 'Often', points: 3 },
  { label: 'Always', points: 4 },
] as const;

const MAX_POINTS = 4;

export const QUESTIONS = LEAK_AREAS.flatMap((area) =>
  area.questions.map((text) => ({ areaId: area.id, areaName: area.name, text })),
);

/** Ties for the biggest leak go to the earlier pillar in this list. */
const TIE_PRIORITY = ['cash', 'sales', 'operations', 'offer', 'team', 'tech'];

/** Questions 15, 22, 23 and 25 measure how much the business depends on its owner. */
const OWNER_QUESTIONS = [14, 21, 22, 24];

export type Band = 'firefighting' | 'surviving' | 'stabilising' | 'scaling';

export const BAND_COPY: Record<Band, { title: string; body: string }> = {
  firefighting: {
    title: 'Firefighting',
    body: 'Money and effort are slipping out in several places at once. That is common, and it is fixable one pillar at a time.',
  },
  surviving: {
    title: 'Surviving',
    body: 'The business holds together, but a lot depends on you working hard. A few fixes will free up time and cash.',
  },
  stabilising: {
    title: 'Stabilising',
    body: 'Most of the basics hold. Fix the weakest pillar and the rest gets easier to grow.',
  },
  scaling: {
    title: 'Scaling',
    body: 'The foundations are strong. Look at your weakest pillar for the next gain.',
  },
};

interface ArchetypeDef {
  id: string;
  name: string;
  superpower: string;
  blindSpot: string;
  high: string[];
  low: string[];
}

const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'hustler',
    name: 'The Hustler',
    superpower: 'You find customers and you know what you sell.',
    blindSpot: 'Delivery and team run on your energy, so growth means more of you.',
    high: ['sales', 'offer'],
    low: ['operations', 'team'],
  },
  {
    id: 'steward',
    name: 'The Steward',
    superpower: 'You keep the money straight and the work running.',
    blindSpot: 'Not enough new customers are coming in.',
    high: ['cash', 'operations'],
    low: ['sales'],
  },
  {
    id: 'visionary',
    name: 'The Visionary',
    superpower: 'Your offer is clear and people want it.',
    blindSpot: 'Money and delivery are not tracked closely enough to keep up.',
    high: ['offer'],
    low: ['cash', 'operations'],
  },
  {
    id: 'builder',
    name: 'The Builder',
    superpower: 'Your tools and processes are solid.',
    blindSpot: 'Not enough people are finding and buying from you.',
    high: ['tech', 'operations'],
    low: ['sales'],
  },
];

const OPERATOR: Omit<ArchetypeDef, 'high' | 'low'> = {
  id: 'operator',
  name: 'The Operator',
  superpower: 'No pillar is a weak spot, and the business is balanced.',
  blindSpot: 'Balance can hide the next big move. Pick one pillar to push hard.',
};

export interface LeakResult {
  total: number;
  band: Band;
  areas: { area: LeakArea; score: number }[];
  leakiest: { area: LeakArea; score: number };
  archetype: { id: string; name: string; superpower: string; blindSpot: string };
  /** 0-16: the sum of the four owner-dependence questions. */
  ownerDependence: number;
  ownerDependent: boolean;
}

/** answers[i] is the points (0-4) for QUESTIONS[i]. */
export function scoreLeakTest(answers: number[]): LeakResult {
  const areas = LEAK_AREAS.map((area) => {
    const sum = QUESTIONS.reduce((acc, q, i) => (q.areaId === area.id ? acc + (answers[i] ?? 0) : acc), 0);
    const count = QUESTIONS.filter((q) => q.areaId === area.id).length;
    return { area, score: Math.round((sum / (count * MAX_POINTS)) * 100) };
  });

  const total = Math.round(areas.reduce((acc, a) => acc + a.score, 0) / areas.length);
  const band: Band = total < 40 ? 'firefighting' : total < 60 ? 'surviving' : total < 80 ? 'stabilising' : 'scaling';

  const leakiest = areas.reduce((low, cur) => {
    if (cur.score < low.score) return cur;
    if (cur.score === low.score && TIE_PRIORITY.indexOf(cur.area.id) < TIE_PRIORITY.indexOf(low.area.id)) return cur;
    return low;
  }, areas[0]);

  const score = (id: string) => areas.find((a) => a.area.id === id)!.score;
  const isOperator = areas.filter((a) => a.score > 70).length >= 3 && areas.every((a) => a.score >= 50);
  let archetype: { id: string; name: string; superpower: string; blindSpot: string } = OPERATOR;
  if (!isOperator) {
    const avg = (ids: string[]) => ids.reduce((acc, id) => acc + score(id), 0) / ids.length;
    archetype = ARCHETYPES.reduce((best, cur) => {
      const fit = avg(cur.high) - avg(cur.low);
      const bestFit = avg(best.high) - avg(best.low);
      return fit > bestFit ? cur : best;
    }, ARCHETYPES[0]);
  }

  const ownerDependence = OWNER_QUESTIONS.reduce((acc, i) => acc + (answers[i] ?? 0), 0);

  return { total, band, areas, leakiest, archetype, ownerDependence, ownerDependent: ownerDependence < 8 };
}

/** Answers to the five profile questions. Not scored: used to segment and benchmark. */
export interface LeakProfile {
  industry: string;
  business_age: string;
  team_size: string;
  revenue_band: string;
  main_goal: string;
}

export const PROFILE_QUESTIONS: { key: keyof LeakProfile; label: string; options: string[] }[] = [
  {
    key: 'industry',
    label: 'What industry are you in?',
    options: [
      'Retail and e-commerce',
      'Food and hospitality',
      'Professional services',
      'Beauty and wellness',
      'Fashion',
      'Agriculture',
      'Education and training',
      'Construction and real estate',
      'Tech and digital',
      'Health care',
      'Logistics and transport',
      'Manufacturing',
      'Other',
    ],
  },
  {
    key: 'business_age',
    label: 'How old is the business?',
    options: ['Under 1 year', '1 to 2 years', '3 to 5 years', '6 to 10 years', 'Over 10 years'],
  },
  {
    key: 'team_size',
    label: 'How many people work in it, including you?',
    options: ['Just me', '2 to 5', '6 to 15', '16 to 50', 'Over 50'],
  },
  {
    key: 'revenue_band',
    label: 'What is your monthly revenue?',
    options: ['Under ₦200,000', '₦200,000 to ₦1 million', '₦1 million to ₦5 million', '₦5 million to ₦20 million', 'Over ₦20 million', 'Prefer not to say'],
  },
  {
    key: 'main_goal',
    label: 'What is your main goal right now?',
    options: [
      'Get more customers',
      'Make more profit',
      'Spend less time working in the business',
      'Hire and delegate',
      'Systemise and automate',
      'Prepare to raise money',
    ],
  },
];

export const emptyProfile = (): LeakProfile => ({ industry: '', business_age: '', team_size: '', revenue_band: '', main_goal: '' });

/** The four questions behind the owner-dependence index, in the report's breakdown. */
export const OWNER_QUESTION_INDEXES = [14, 21, 22, 24];

/** Pillars from weakest to strongest, with ties going to the earlier tie-break pillar. */
export function rankLeaks(result: LeakResult) {
  return [...result.areas].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return TIE_PRIORITY.indexOf(a.area.id) - TIE_PRIORITY.indexOf(b.area.id);
  });
}
