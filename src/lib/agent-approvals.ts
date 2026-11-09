import { supabase } from './supabase';
import { AGENT_PLATFORM_URL, freshToken } from './agent-runs';

/**
 * Approvals: things an agent asked to do that change something. The agent only files the request; a person decides
 * here, and an approval makes the platform perform the action once. Requests are read from breadmaker.agent_approvals
 * (the team reads them); the decision goes to the platform, which checks the person is an owner or coach.
 */

export type ApprovalStatus = 'pending' | 'rejected' | 'approved' | 'executed' | 'failed';

export interface Approval {
  id: string;
  agentName: string;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  status: ApprovalStatus;
  result: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export async function loadApprovals(limit = 30): Promise<Approval[]> {
  const { data, error } = await supabase.from('agent_approvals').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, any>) => ({
    id: row.id,
    agentName: row.agent_name || 'An agent',
    tool: row.tool,
    input: row.input ?? {},
    summary: row.summary,
    status: row.status,
    result: row.result ?? null,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
  }));
}

export async function decideApproval(id: string, decision: 'approve' | 'reject'): Promise<{ status: ApprovalStatus; result: string | null }> {
  const token = await freshToken();
  if (!token) throw new Error('Sign in again to decide.');
  const response = await fetch(`${AGENT_PLATFORM_URL}/approvals/${id}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json().catch(() => ({}))) as { status?: ApprovalStatus; result?: string | null; error?: string };
  if (!response.ok || !body.status) throw new Error(body.error || `The agent platform answered ${response.status}.`);
  return { status: body.status, result: body.result ?? null };
}

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Waiting',
  rejected: 'Rejected',
  approved: 'Approved',
  executed: 'Done',
  failed: 'Failed',
};
