/**
 * The tools Breadmaker runs on, and the ones we teach in Foundry and Launchpad.
 * Only list a tool here if we use it ourselves. No prices: they change, and the
 * tool's own site is the source of truth.
 */

export interface StackTool {
  name: string;
  /** What job it does in the stack. */
  category: string;
  /** What it does for us, in plain words. */
  body: string;
  /** Display domain; the link is https://<domain>. */
  domain: string;
}

export const STACK_TOOLS: StackTool[] = [
  {
    name: 'Claude Code',
    category: 'The builder',
    body: 'You describe the change in plain language and it writes the code. We build and change our own systems with it, and you review what it changes before you ship.',
    domain: 'claude.ai',
  },
  {
    name: 'GitHub',
    category: 'Version control',
    body: 'Every piece of code lives here with a full history of changes. In Foundry your code sits in a private repository in your own account from day 1.',
    domain: 'github.com',
  },
  {
    name: 'Supabase',
    category: 'Database and sign-in',
    body: 'Your data, your customer accounts and the rules about who can see what. It also runs the small server functions behind our forms and payments.',
    domain: 'supabase.com',
  },
  {
    name: 'Coolify',
    category: 'Hosting',
    body: 'Puts a project on a server you control and redeploys it when the code changes, without renting a locked-in platform.',
    domain: 'coolify.io',
  },
  {
    name: 'Cloudflare',
    category: 'Domain and security',
    body: 'Points your domain at your server and adds a protective layer in front of it. Two-step sign-in is switched on here from the start.',
    domain: 'cloudflare.com',
  },
  {
    name: 'Flutterwave',
    category: 'Payments',
    body: 'Takes card and bank payments, and tells our system when one succeeds so access opens automatically. Approval can take days, so we start the application early.',
    domain: 'flutterwave.com',
  },
  {
    name: 'Resend',
    category: 'Email',
    body: 'Sends the automatic replies, sign-in links and report emails that go out the moment someone acts.',
    domain: 'resend.com',
  },
  {
    name: 'React and Vite',
    category: 'The page itself',
    body: 'What this site is built with: fast pages that work on a phone, and a codebase you can hand to the next developer.',
    domain: 'vite.dev',
  },
];
