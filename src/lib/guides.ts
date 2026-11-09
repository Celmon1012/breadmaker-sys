import { Route } from '../types';

/**
 * Free guides. Each one is practical on its own and points to the system,
 * program or tool that does the work for you. Copy follows the same rules as
 * the rest of the site: plain language, a definition of done, risk named, and
 * no promised earnings.
 */

export type GuideCategory = 'Diagnose' | 'Get paid' | 'Build' | 'Systems';

export interface GuideSection {
  heading: string;
  paragraphs?: string[];
  /** A short list shown under the paragraphs. */
  points?: string[];
  /** One line that says how to know this step is done. */
  done?: string;
}

export interface Guide {
  slug: string;
  category: GuideCategory;
  title: string;
  /** One or two sentences for the card and the page intro. */
  summary: string;
  minutes: number;
  sections: GuideSection[];
  /** Where this guide leads next. */
  next: { label: string; route: Route; blurb: string };
}

export const GUIDES: Guide[] = [
  {
    slug: 'where-your-business-leaks',
    category: 'Diagnose',
    title: 'Where your business is leaking',
    summary:
      'Six places money and effort slip out of a small business, and the one thing to fix first in each. Start here before you build anything.',
    minutes: 6,
    sections: [
      {
        heading: 'Leaks, not gaps',
        paragraphs: [
          'Most owners think they need more: more leads, more tools, more hours. Often the business already brings in enough and loses it on the way through. A leak is a place where something valuable escapes without you noticing.',
          'There are six places to check. Score yourself honestly on each: never, sometimes or always.',
        ],
      },
      {
        heading: 'Offer and positioning',
        paragraphs: ['If you cannot say who you serve and what result you deliver in one sentence, customers cannot either.'],
        points: [
          'Write one sentence: who it is for, what they get and the price.',
          'Put it at the top of your page and your messages.',
        ],
        done: 'A stranger can repeat your offer back to you after five seconds.',
      },
      {
        heading: 'Sales and lead flow',
        paragraphs: ['You cannot fix a leak you cannot see. Most lost sales are slow replies, not bad offers.'],
        points: [
          'Answer every enquiry within a day for two weeks.',
          'Keep a simple list of each enquiry and what happened to it.',
        ],
        done: 'You know where your last ten customers came from.',
      },
      {
        heading: 'Operations and systems',
        paragraphs: ['If delivery lives in your memory, quality depends on your mood and the business stops when you do.'],
        points: ['Write the five steps you do for every customer, in order.'],
        done: 'That list exists and someone else could follow it. It is your first system.',
      },
      {
        heading: 'Finance and cash',
        paragraphs: ['Revenue is not profit, and profit you cannot see is not much use.'],
        points: [
          'Keep business money in its own account.',
          'Every Friday, write down money in, money out and what you are still owed.',
        ],
        done: 'You can state last month’s profit, not just revenue.',
      },
      {
        heading: 'Team and owner dependence',
        paragraphs: ['The most expensive leak is the owner. If every decision waits for you, growth stops at the edge of your day.'],
        points: ['List the three tasks only you do, then write instructions for one and hand it off this month.'],
        done: 'The business runs for a week without you.',
      },
      {
        heading: 'Tech and automation',
        paragraphs: ['Customers should be able to find you and pay you online, and your data should be backed up and under your own login.'],
        points: [
          'Move your domain and key accounts under your own login.',
          'Turn on two-step sign-in.',
          'Test your payment or enquiry form from start to finish.',
        ],
        done: 'A test enquiry or payment completes with no help from you.',
      },
    ],
    next: {
      label: 'Take the free Business Leak Test',
      route: 'leak-test',
      blurb: 'Thirty questions, about four minutes. You get your score and the name of your biggest leak.',
    },
  },
  {
    slug: 'get-paid-online-in-seven-days',
    category: 'Get paid',
    title: 'Get paid online in seven days',
    summary:
      'The shortest path from an idea to a working page that takes enquiries, bookings or payments, without becoming technical.',
    minutes: 5,
    sections: [
      {
        heading: 'One goal, one page',
        paragraphs: [
          'The reason most first websites stall is scope. A page that tries to do everything never goes live. Pick one action you want a visitor to take: send an enquiry, book a call or pay.',
        ],
      },
      {
        heading: 'Day 1 to 2: choose and write',
        paragraphs: ['Decide the goal, then write your offer on one page.'],
        points: ['Who it is for', 'The problem you solve', 'What you deliver', 'The price', 'The one action you want taken'],
        done: 'You can read the offer aloud in under a minute and it makes sense.',
      },
      {
        heading: 'Day 3 to 4: build on a proven template',
        paragraphs: [
          'Do not design from a blank page. Start from a template that already works on phones, then change the words and photos to fit your offer.',
        ],
        done: 'The page looks right on a phone and on a computer.',
      },
      {
        heading: 'Day 5: connect',
        paragraphs: ['A page that looks good but does nothing is a poster. Connect the form, booking or payment, an automatic reply and basic tracking.'],
        done: 'A visitor can act, and you can see that they did.',
      },
      {
        heading: 'Day 6 to 7: test, then launch',
        paragraphs: ['Run a test enquiry and a test payment yourself, on a phone and a computer. Fix what breaks, then put the page on your own domain.'],
        points: ['Your content, your domain and your page stay yours.'],
        done: 'A real stranger could pay you today.',
      },
      {
        heading: 'What this will not do',
        paragraphs: [
          'A working page is not a guarantee of sales. What it earns depends on your offer, your market and how you follow up.',
        ],
      },
    ],
    next: {
      label: 'See Breadmaker Launchpad',
      route: 'launchpad',
      blurb: 'The guided 7-day version of this guide, built with you and launched on your own domain.',
    },
  },
  {
    slug: 'own-the-systems-your-business-runs-on',
    category: 'Build',
    title: 'Own the systems your business runs on',
    summary:
      'Why renting your tools is a risk, what owning them looks like, and the four-week order to build a system that is yours.',
    minutes: 7,
    sections: [
      {
        heading: 'Rented tools are a quiet risk',
        paragraphs: [
          'When your page, payments and customer list live inside someone else’s product, a price change, a policy change or a closed account can stop your business in a day. Owning the system means the server, the code and the data are in your name.',
        ],
        points: ['Your own server, so nothing is shared', 'Your own code, in a private repository in your account', 'Your own data, exportable at any time'],
      },
      {
        heading: 'Week 1: frontend',
        paragraphs: ['Write the offer, ship the page on your own domain and capture a first lead into your own database.'],
        done: 'A stranger understands your offer in five seconds and a test lead lands in your database.',
      },
      {
        heading: 'Week 2: backend',
        paragraphs: ['Set up your data, secure it, take a payment and see your leads and customers in one place.'],
        done: 'A payment completes and is recorded in your own data.',
      },
      {
        heading: 'Week 3: automation',
        paragraphs: ['Connect the two halves so follow-up, notifications and onboarding run without you. Then put one AI agent to work on one real task.'],
        done: 'A new lead moves through your pipeline with no manual step.',
      },
      {
        heading: 'Week 4: launch and operate',
        paragraphs: ['Test everything end to end, prove you can roll back and restore from a backup, lock down security and go live.'],
        done: 'You can restore from a backup and a security checklist is signed off.',
      },
      {
        heading: 'Is this for you yet?',
        paragraphs: [
          'You should be comfortable with GitHub basics and a terminal, and willing to review what an AI tool changes before you push it. If that is not you yet, start with a simple page first.',
        ],
      },
    ],
    next: {
      label: 'See Breadmaker Foundry',
      route: 'foundry',
      blurb: 'The 30-day guided build of a live system with payments, automation and one AI agent, on your own server and code.',
    },
  },
  {
    slug: 'build-a-business-that-runs-without-you',
    category: 'Build',
    title: 'Build a business that runs without you',
    summary:
      'A practical way to find what only you do, write it down and hand it over, one task at a time.',
    minutes: 5,
    sections: [
      {
        heading: 'Start with an honest list',
        paragraphs: ['For one week, note every task you do that someone else could do with instructions. Do not judge them yet. Just list them.'],
        done: 'You have a written list of at least ten tasks.',
      },
      {
        heading: 'Pick the first task to hand off',
        paragraphs: ['Choose the task that is frequent, low risk and clear in how it ends. Replying to common enquiries or sending invoices are common first picks.'],
      },
      {
        heading: 'Write the steps once',
        paragraphs: ['Write each step in plain words, with the tool it uses and what done looks like. If you can record a short screen video while you do it, do that too.'],
        points: ['What triggers the task', 'The steps, in order', 'What done looks like', 'What to do when something goes wrong'],
        done: 'Someone new could follow the page without asking you a question.',
      },
      {
        heading: 'Hand it over, then review',
        paragraphs: ['Let the other person do it while you watch, then check the first few results yourself. Fix the instructions, not the person.'],
        done: 'The task is done correctly three times in a row without you.',
      },
      {
        heading: 'Then repeat, and automate what repeats',
        paragraphs: ['Once a written process works, the repetitive parts are good candidates for automation. Automating a process that is not written down just makes the mess faster.'],
      },
    ],
    next: {
      label: 'Take the free Business Leak Test',
      route: 'leak-test',
      blurb: 'See how dependent your business is on you, and which leak to fix first.',
    },
  },
  {
    slug: 'automate-without-over-building',
    category: 'Systems',
    title: 'Automate without over-building',
    summary:
      'What to automate first, what to leave alone, and how to use one AI agent on one real task before you add anything else.',
    minutes: 6,
    sections: [
      {
        heading: 'Automate the boring, repeated, rule-based work',
        paragraphs: ['A good first candidate happens often, follows the same steps every time and has a clear right answer.'],
        points: [
          'Replying the moment someone signs up',
          'Reminders and follow-ups',
          'Invoices and payment confirmations',
          'Moving a new lead into the right list',
        ],
      },
      {
        heading: 'Leave judgement and relationships alone',
        paragraphs: ['Pricing a custom job, handling an upset customer and deciding who to hire are not good first automations. Use the time you save elsewhere for them.'],
      },
      {
        heading: 'Write the process before you automate it',
        paragraphs: ['If you cannot describe the steps, a tool cannot do them. Write them out, run them by hand a few times, then automate.'],
        done: 'The manual version works reliably before any tool is added.',
      },
      {
        heading: 'Put one AI agent on one real task',
        paragraphs: [
          'Choose a task with a narrow scope and an easy check, such as drafting a first reply for you to approve. Review its output until you trust it, and keep a human check on anything that touches money or a customer.',
        ],
        done: 'The agent does one real task and you can show the before and after.',
      },
      {
        heading: 'Keep a way back',
        paragraphs: ['Know how to switch an automation off and how to restore from a backup. A system you cannot roll back is a risk, not an asset.'],
      },
    ],
    next: {
      label: 'See how Foundry builds this with you',
      route: 'foundry',
      blurb: 'Week 3 of Foundry connects follow-up and onboarding and puts one AI agent to work.',
    },
  },
  {
    slug: 'how-we-prove-a-system',
    category: 'Systems',
    title: 'How we prove a system before we teach it',
    summary:
      'The four checks every Breadmaker system passes before it is listed as live, and how you can use the same checks on any system you are offered.',
    minutes: 4,
    sections: [
      {
        heading: 'Why a standard matters',
        paragraphs: ['Every week there is a new way to earn: a strategy, a bot, an agent, a course. Most are untested, and people who provide for others cannot afford to be the test.'],
      },
      {
        heading: '1. Was it run for real first?',
        paragraphs: ['Ask who built and operated the system with their own time and money, before selling it to you. Screenshots from other people do not count.'],
      },
      {
        heading: '2. Is the outcome stated up front?',
        paragraphs: ['A system should name one specific goal and a plain definition of working that you can check yourself.'],
      },
      {
        heading: '3. Is there a record?',
        paragraphs: ['What was set up, what happened and what went wrong should be written down. A system with no record is a claim, not a proof.'],
      },
      {
        heading: '4. Is the risk named?',
        paragraphs: ['Where a system can lose money or break, the page should say so. Be wary of anything that promises earnings.'],
      },
      {
        heading: 'Use it on us too',
        paragraphs: ['Systems that do not yet pass are listed as testing, with no performance claims. That is the standard we hold ourselves to.'],
      },
    ],
    next: {
      label: 'See Launchpad and Foundry',
      route: 'home',
      blurb: 'The two builds, and how to pick one.',
    },
  },
];

export function findGuide(slug: string | undefined): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
