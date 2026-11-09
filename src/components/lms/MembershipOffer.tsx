import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { COMMUNITY_PRICE_USD, WAITLIST_MODE } from '../../lib/hub';
import { PARTNER_AGENT_BUDGET_USD, PARTNER_PRICE_USD, PARTNER_SEATS, PARTNER_UPTIME } from '../../lib/prestige';
import { REPLY_TIME } from '../../lib/program-config';
import HubWaitlistDialog from '../HubWaitlistDialog';
import { Button, CARD } from './lms-ui';

/**
 * The two ways to join, inside the dashboard: Community and Prestige, with what each includes and how to join.
 * The public membership page says the same thing at more length; this is the version a signed-in member sees.
 */

function Tier({ name, price, per, line, perks, cta, featured = false }: { name: string; price: string; per: string; line: string; perks: string[]; cta: React.ReactNode; featured?: boolean }) {
  return (
    <section className={`${CARD} flex flex-col p-5 sm:p-7 ${featured ? 'border-[var(--pg-ink)]' : ''}`}>
      <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">{name}</p>
      <p className="mt-3 font-editorial text-[38px] font-bold leading-none tracking-[-0.02em]">
        {price}
        <span className="ml-1 text-[16px] font-medium text-[var(--pg-body)]">{per}</span>
      </p>
      <p className="mt-3 text-[15px] leading-[1.55] text-[var(--pg-body)]">{line}</p>
      <ul className="mt-5 flex-1 space-y-2.5 text-[15px] leading-[1.45]">
        {perks.map((perk) => (
          <li key={perk} className="flex gap-2.5">
            <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--pg-accent)]" aria-hidden="true" /> {perk}
          </li>
        ))}
      </ul>
      <div className="mt-6">{cta}</div>
    </section>
  );
}

export default function MembershipOffer({ openPath, showCommunity = true }: { openPath: (path: string) => void; showCommunity?: boolean }) {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  return (
    <>
      <div className={`grid gap-4 ${showCommunity ? 'lg:grid-cols-2' : 'max-w-[560px]'}`}>
        {showCommunity && (
          <Tier
            name="Breadmaker Community"
            price={`$${COMMUNITY_PRICE_USD}`}
            per="one-time"
            line="The members-only room, and the tools behind the builds."
            perks={['Private WhatsApp community', 'Every kit, free', 'Templates, checklists and resources', 'The internal tools we use to run our own systems', `Support, with a reply within ${REPLY_TIME}`]}
            cta={WAITLIST_MODE ? <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setWaitlistOpen(true)}>Join the waitlist</Button> : <Button variant="ghost" className="w-full sm:w-auto" onClick={() => openPath('/membership')}>See how to join</Button>}
          />
        )}
        <Tier
          featured
          name="Breadmaker Prestige"
          price={`$${PARTNER_PRICE_USD}`}
          per="/ month"
          line={`Everything in Community, and a team that runs your systems. ${PARTNER_SEATS} seats in this first group, approved by hand.`}
          perks={['Everything in Breadmaker Community', `A developer on WhatsApp, with $${PARTNER_AGENT_BUDGET_USD} of usage a month`, `Hosting on your own dedicated server, with a ${PARTNER_UPTIME} uptime target`, 'Priority support']}
          cta={<Button className="w-full sm:w-auto" onClick={() => openPath('/membership/apply')}>Apply for Prestige</Button>}
        />
      </div>
      <p className="mt-4 text-[14px] text-[var(--pg-body)]">
        Want the detail first?{' '}
        <button onClick={() => openPath('/membership')} className="font-medium text-[var(--pg-accent)] underline underline-offset-4 cursor-pointer">Read the full membership page</button>.
      </p>
      <HubWaitlistDialog open={waitlistOpen} onClose={() => setWaitlistOpen(false)} />
    </>
  );
}
