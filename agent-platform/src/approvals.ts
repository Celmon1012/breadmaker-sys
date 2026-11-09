// Approval-gated actions. A tool with a write risk never runs when an agent calls it: the call is stored as a pending
// approval and the agent is told so. Only a person's approval makes the platform perform the action, once.
//
// This is a queue in the database, not a paused run: a person may decide hours later, and the platform may have
// restarted by then. The action's input is fixed when it is requested; the approver cannot change it.
import { createTool } from '@mastra/core/tools';
import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { config } from './config.ts';
import { safe } from './redact.ts';
import { claimApproval, createApproval, finishApproval, getApproval, type ApprovalRow } from './store.ts';

export type Risk = 'read' | 'write';

const UUID = z.string().regex(/^[a-z0-9]{20,36}$/i, 'That is not a Coolify uuid.');

async function coolifyWrite(path: string): Promise<string> {
  if (!config.coolifyUrl || !config.coolifyWriteToken) throw new Error('No Coolify write token is set on the agent platform (COOLIFY_WRITE_TOKEN), so nothing can be changed.');
  const call = (method: string) => fetch(`${config.coolifyUrl}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${config.coolifyWriteToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  let response = await call('POST');
  if (response.status === 405 || response.status === 404) response = await call('GET');
  const text = await response.text();
  if (!response.ok) throw new Error(`Coolify ${response.status}: ${text.slice(0, 200)}`);
  return safe(text, 400);
}

export interface Action {
  description: string;
  /** The input the agent supplies. A schema Mastra can read (zod, or what an MCP server publishes). */
  input: any;
  /** Checks and cleans the input. When missing, input.parse is used; an MCP schema that cannot parse is trusted as the server published it. */
  parse?: (raw: unknown) => Record<string, unknown>;
  /** One plain sentence of what approving does. */
  summary: (input: Record<string, any>) => string;
  run: (input: Record<string, any>) => Promise<string>;
}

/** The actions an agent can ask for. Each is reversible; nothing destructive or money-moving is offered. */
export const ACTIONS: Record<string, Action> = {
  restart_app: {
    description: 'Ask for an application to be restarted (by uuid). It does not restart now: a person must approve first.',
    input: z.object({ uuid: UUID, reason: z.string().max(300).describe('Why it needs restarting, in one sentence') }),
    summary: (input) => `Restart the application ${input.uuid}. Reason: ${input.reason}`,
    run: (input) => coolifyWrite(`/applications/${encodeURIComponent(input.uuid)}/restart`),
  },
  redeploy_app: {
    description: 'Ask for an application to be rebuilt and redeployed from its source (by uuid). It does not deploy now: a person must approve first.',
    input: z.object({ uuid: UUID, reason: z.string().max(300).describe('Why it needs redeploying, in one sentence') }),
    summary: (input) => `Rebuild and redeploy the application ${input.uuid}. Reason: ${input.reason}`,
    run: (input) => coolifyWrite(`/deploy?uuid=${encodeURIComponent(input.uuid)}`),
  },
};

/** Web tools and MCP servers register how to carry out their own approved requests; approvals stay independent of both. */
type Resolver = (toolId: string) => Promise<Action | undefined>;
const resolvers: Resolver[] = [];
export const addActionResolver = (resolver: Resolver) => {
  resolvers.push(resolver);
};
async function extraResolver(toolId: string): Promise<Action | undefined> {
  for (const resolver of resolvers) {
    const found = await resolver(toolId).catch(() => undefined);
    if (found) return found;
  }
  return undefined;
}

export const toolRisk: Record<string, Risk> = Object.fromEntries(Object.keys(ACTIONS).map((id) => [id, 'write' as const]));

/** What a tool's execute reads from the run it is part of, so a request can be traced back to its run and agent. */
export const RUN_KEYS = { runId: 'runId', agentId: 'agentId', agentName: 'agentName' } as const;

function checkInput(action: Action, raw: unknown): Record<string, any> {
  if (action.parse) return action.parse(raw);
  if (typeof action.input?.parse === 'function') return action.input.parse(raw);
  return (raw ?? {}) as Record<string, any>;
}

export function approvalTool(id: string, action: Action) {
  return createTool({
    id,
    description: action.description,
    inputSchema: action.input,
    execute: async (raw: unknown, context?: { requestContext?: RequestContext<Record<string, unknown>> }) => {
      const input = checkInput(action, raw);
      const ctx = context?.requestContext;
      const row = await createApproval({
        run_id: (ctx?.get(RUN_KEYS.runId) as string | undefined) ?? null,
        agent_id: (ctx?.get(RUN_KEYS.agentId) as string | undefined) ?? null,
        agent_name: (ctx?.get(RUN_KEYS.agentName) as string | undefined) ?? '',
        tool: id,
        input,
        summary: safe(action.summary(input), 500),
      });
      return { queued: true, approvalId: row.id, message: 'This needs a person to approve it. It has NOT been done yet. Tell the user it is waiting for approval in the studio.' };
    },
  });
}

export const writeTools = Object.fromEntries(Object.entries(ACTIONS).map(([id, action]) => [id, approvalTool(id, action)]));

export class ApprovalError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

/**
 * A person's decision. The row is claimed first (pending to approved or rejected, in one step), so a double click or
 * two people deciding at once cannot run the action twice. Approving performs the action and records what happened.
 */
export async function decide(approvalId: string, decision: 'approve' | 'reject', userId: string): Promise<ApprovalRow> {
  const existing = await getApproval(approvalId);
  if (!existing) throw new ApprovalError('No such request.', 404);
  const claimed = await claimApproval(approvalId, decision === 'approve' ? 'approved' : 'rejected', userId);
  if (!claimed) throw new ApprovalError(`That request was already ${existing.status === 'pending' ? 'decided' : existing.status}.`);
  if (decision === 'reject') return claimed;

  const action = ACTIONS[claimed.tool] ?? (await extraResolver(claimed.tool));
  if (!action) return finishApproval(approvalId, 'failed', 'This kind of action is no longer offered.');
  try {
    const parsed = checkInput(action, claimed.input);
    return await finishApproval(approvalId, 'executed', await action.run(parsed));
  } catch (error) {
    return finishApproval(approvalId, 'failed', safe(error instanceof Error ? error.message : String(error), 500));
  }
}
