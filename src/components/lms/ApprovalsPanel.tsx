import React, { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../lib/lms';
import { APPROVAL_LABEL, Approval, decideApproval, loadApprovals } from '../../lib/agent-approvals';
import { timeAgo } from '../../lib/agent-runs';
import { Button, CARD, Chip, Notice, useTeamRole } from './lms-ui';

/**
 * What agents have asked to do, waiting for a person. Nothing happens until it is approved here, and an approval runs
 * the action once. Everything decided stays listed, with what happened, as the record.
 */
export default function ApprovalsPanel() {
  const { role } = useTeamRole();
  const canDecide = role === 'Owner' || role === 'Coach';
  const [items, setItems] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await loadApprovals());
    } catch {
      // The approvals table may not exist yet (migration 61): show nothing rather than an error.
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    setError(null);
    try {
      await decideApproval(id, decision);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  if (!items || items.length === 0) return null;
  const pending = items.filter((item) => item.status === 'pending');
  const decided = items.filter((item) => item.status !== 'pending').slice(0, 6);

  return (
    <section aria-labelledby="approvals">
      <h2 id="approvals" className="mb-1 text-[18px] font-semibold">Waiting for approval{pending.length ? ` (${pending.length})` : ''}</h2>
      <p className="mb-3 text-[14px] text-[var(--pg-body)]">Agents can ask to restart or redeploy an app. Nothing happens until an owner or coach approves it here, and approving does it once.</p>
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
      {pending.length === 0 ? (
        <div className={`${CARD} p-4 text-[14.5px] text-[var(--pg-body)]`}>Nothing is waiting.</div>
      ) : (
        <ul className="space-y-3">
          {pending.map((item) => (
            <li key={item.id} className={`${CARD} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">{item.agentName}</span><Chip>{item.tool}</Chip><span className="text-[12.5px] text-[var(--pg-body)]">{timeAgo(item.createdAt)}</span></div>
                  <p className="mt-1.5 text-[15px] leading-[1.5]">{item.summary}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" busy={busy === item.id} disabled={!canDecide} onClick={() => void decide(item.id, 'reject')}>Reject</Button>
                  <Button busy={busy === item.id} disabled={!canDecide} onClick={() => void decide(item.id, 'approve')}>Approve</Button>
                </div>
              </div>
              {!canDecide && <p className="mt-2 text-[12.5px] text-[var(--pg-body)]">Only owners and coaches can decide.</p>}
            </li>
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13.5px] text-[var(--pg-body)]">Recent decisions</summary>
          <ul className={`${CARD} mt-2 divide-y divide-[var(--pg-line-soft)]`}>
            {decided.map((item) => (
              <li key={item.id} className="px-4 py-3 text-[14px]">
                <div className="flex flex-wrap items-center gap-2"><Chip tone={item.status === 'executed' ? 'accent' : 'neutral'}>{APPROVAL_LABEL[item.status]}</Chip><span>{item.summary}</span></div>
                {item.result && <p className="mt-1 text-[12.5px] text-[var(--pg-body)]">{item.result}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
