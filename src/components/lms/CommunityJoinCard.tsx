import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, CARD } from './lms-ui';

/**
 * Launchpad and Foundry buyers are asked once whether to join the Breadmaker WhatsApp community.
 * The answer is kept in the database; "yes" queues the invite, which arrives on the number they paid with.
 * Shows nothing for anyone who is not a buyer, has answered, or when the check fails.
 */
export default function CommunityJoinCard() {
  const [status, setStatus] = useState<string>('na');
  const [saving, setSaving] = useState(false);
  const [answered, setAnswered] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('community_optin_status').then(({ data, error }) => {
      if (!cancelled && !error && typeof data === 'string') setStatus(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const answer = async (opt: boolean) => {
    setSaving(true);
    const { error } = await supabase.rpc('set_community_optin', { opt });
    setSaving(false);
    if (!error) setAnswered(opt);
  };

  if (answered !== null) {
    return (
      <section className={`${CARD} mt-8 p-6 lg:p-8`} aria-label="Community">
        <p className="text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
          {answered
            ? 'Done. We will add you to the Breadmaker community on WhatsApp, on the number you paid with. If WhatsApp does not let us add you directly, you get an invite link there instead.'
            : 'No problem. You can still join later by asking us.'}
        </p>
      </section>
    );
  }
  if (status !== 'ask') return null;

  return (
    <section className={`${CARD} mt-8 p-6 lg:p-8`} aria-label="Join the community">
      <p className="font-label text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Community</p>
      <h2 className="mt-2 font-editorial text-[24px] font-semibold leading-[1.2]">Join the Breadmaker community on WhatsApp?</h2>
      <p className="mt-2 max-w-[620px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
        It is where members share what they are building, and where announcements go out. It is optional. We use the WhatsApp number you gave when you paid.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={() => void answer(true)} busy={saving}>Yes, add me</Button>
        <Button variant="ghost" onClick={() => void answer(false)} disabled={saving}>No thanks</Button>
      </div>
    </section>
  );
}
