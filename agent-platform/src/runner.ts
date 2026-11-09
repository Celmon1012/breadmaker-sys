// Runs an agent and records the whole run: this is the spine every view (Runs, Metrics, later Alerts) reads.
import { Mastra } from '@mastra/core';
import type { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { RUN_KEYS } from './approvals.ts';
import { buildAgent, registry, type AgentDef } from './defs.ts';
import { KNOWLEDGE_NOTE, knowledgeTool } from './knowledge.ts';
import { findModel, isConnected, priceOf } from './models.ts';
import { agents, type AgentId } from './agents.ts';
import { config } from './config.ts';
import { safe } from './redact.ts';
import { createRun, finishRun, hasKnowledge, spentThisMonthBy, spentToday, type RunRow } from './store.ts';

export const mastra = new Mastra({ agents });

export class Refused extends Error {}

interface Chunk {
  payload?: { toolCallId?: string; toolName?: string; args?: unknown; result?: unknown; output?: unknown; isError?: boolean };
}
interface Step {
  toolCalls?: Chunk[];
  toolResults?: Chunk[];
}
interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
}

/** One entry per tool call, in order, with inputs and outputs redacted and clipped for storage. */
export function toolCallsOf(steps: Step[]) {
  const calls: { name: string; input: string; output: string | null; error: boolean }[] = [];
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      const id = call.payload?.toolCallId;
      const result = (step.toolResults ?? []).find((r) => r.payload?.toolCallId === id)?.payload;
      calls.push({
        name: call.payload?.toolName ?? 'unknown',
        input: safe(call.payload?.args ?? {}, 1000),
        output: result ? safe(result.result ?? result.output ?? null, 3000) : null,
        error: Boolean(result?.isError),
      });
    }
  }
  return calls;
}

export const costOf = (usage: Usage, model?: string) => {
  const input = usage.inputTokens ?? usage.promptTokens ?? 0;
  const output = usage.outputTokens ?? usage.completionTokens ?? 0;
  const [priceIn, priceOut] = model ? priceOf(model).price : [config.priceInPerM, config.priceOutPerM];
  return { input, output, usd: Number(((input * priceIn + output * priceOut) / 1_000_000).toFixed(5)) };
};

/** Gateway checks, before any model call: the kill switch, the daily cap, and that the model is set up. */
export async function admit(model?: string, ownerId?: string | null): Promise<void> {
  if (config.paused) throw new Refused('Agents are paused (AGENTS_PAUSED=1).');
  // The model's own provider must be connected. A model outside the catalogue (a custom OPS_MODEL) is treated as Anthropic.
  const info = model ? findModel(model) : undefined;
  if (info ? !isConnected(info) : !config.anthropicKey) throw new Refused(`No model key is set on the agent platform (${info?.keyName ?? 'ANTHROPIC_API_KEY'}).`);
  // A member has their own monthly allowance, checked first so they are told the reason that is theirs.
  if (ownerId && (await spentThisMonthBy(ownerId)) >= config.memberMonthlyUsd) throw new Refused(`You have used this month's allowance of $${config.memberMonthlyUsd}. It resets on the 1st (UTC).`);
  const spent = await spentToday();
  if (spent >= config.maxDailyUsd) throw new Refused(`The daily spend cap of $${config.maxDailyUsd} has been reached. It resets at midnight UTC.`);
}

/** Something that can be run: the built-in Ops agent, or an agent built from a stored definition. */
export interface Runnable {
  agent: Agent;
  /** What the run list calls it. */
  label: string;
  model: string;
  /** The definition's id, so its page can list its own runs. */
  agentId: string | null;
}

export const opsRunnable = (): Runnable => ({ agent: mastra.getAgentById('ops'), label: 'ops', model: config.opsModel, agentId: null });
export async function defRunnable(def: AgentDef): Promise<Runnable> {
  const reg = await registry();
  let built = def;
  // An agent with documents gets a search tool over them, and a line telling it to use it and to admit when it finds nothing.
  if (def.id && (await hasKnowledge(def.id))) {
    reg.search_knowledge = knowledgeTool(def.id);
    built = { ...def, tools: [...new Set([...def.tools, 'search_knowledge'])], instructions: `${def.instructions}\n\n${KNOWLEDGE_NOTE}` };
  }
  return { agent: buildAgent(built, reg), label: def.name, model: def.model, agentId: def.id ?? null };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const lastUserText = (input: string | ChatMessage[]) => (typeof input === 'string' ? input : [...input].reverse().find((m) => m.role === 'user')?.content ?? '');

/** Start a run and return its id at once; the work continues in the background and the row is updated as it ends. */
export async function startRun(input: { target: Runnable; text: string; trigger: RunRow['trigger']; requestedBy: string | null; ownerId?: string | null }): Promise<string> {
  await admit(input.target.model, input.ownerId);
  const row = await createRun({ agent: input.target.label, agent_id: input.target.agentId, trigger: input.trigger, input: safe(input.text, 2000), model: input.target.model, requested_by: input.requestedBy, owner_id: input.ownerId ?? null });
  void execute(row.id, input.target, input.text);
  return row.id;
}

export interface Outcome {
  text: string;
  toolCalls: ReturnType<typeof toolCallsOf>;
  costUsd: number;
  failed: boolean;
  error: string | null;
}

/** Run the agent, then record everything in the run row. Never throws: a failure is recorded and returned. */
export async function execute(runId: string, target: Runnable, input: string | ChatMessage[]): Promise<Outcome> {
  const started = Date.now();
  try {
    // Tools read these to say which run and agent a request belongs to.
    const requestContext = new RequestContext<Record<string, unknown>>();
    requestContext.set(RUN_KEYS.runId, runId);
    requestContext.set(RUN_KEYS.agentId, target.agentId);
    requestContext.set(RUN_KEYS.agentName, target.label);
    const result = await target.agent.generate(input as never, {
      requestContext, maxSteps: config.maxSteps, abortSignal: AbortSignal.timeout(5 * 60_000) });
    const usage = costOf((result.totalUsage ?? result.usage ?? {}) as Usage, target.model);
    const calls = toolCallsOf((result.steps ?? []) as unknown as Step[]);
    const error = result.error ? safe(String(result.error.message ?? result.error), 500) : null;
    await finishRun(runId, {
      status: error ? 'failed' : 'completed',
      output: safe(result.text, 8000),
      tool_calls: calls,
      steps: (result.steps ?? []).length,
      tokens_in: usage.input,
      tokens_out: usage.output,
      cost_usd: usage.usd,
      duration_ms: Date.now() - started,
      error,
      finished_at: new Date().toISOString(),
    });
    return { text: result.text, toolCalls: calls, costUsd: usage.usd, failed: Boolean(error), error };
  } catch (error) {
    const message = safe(error instanceof Error ? error.message : String(error), 500);
    await finishRun(runId, { status: 'failed', error: message, duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).catch((inner) =>
      console.error('could not record a failed run', inner),
    );
    return { text: '', toolCalls: [], costUsd: 0, failed: true, error: message };
  }
}

/**
 * A live preview for the wizard: the unsaved definition answers a conversation, and the reply comes back at once.
 * It is a real run (tools included) and is recorded like any other, so what a test costs is never hidden.
 */
export async function previewChat(def: AgentDef, messages: ChatMessage[], requestedBy: string | null, ownerId?: string | null): Promise<Outcome & { runId: string }> {
  await admit(def.model, ownerId);
  const target = await defRunnable(def);
  const row = await createRun({ agent: `preview: ${def.name}`, agent_id: def.id ?? null, trigger: 'console', input: safe(lastUserText(messages), 2000), model: def.model, requested_by: requestedBy, owner_id: ownerId ?? null });
  return { ...(await execute(row.id, target, messages)), runId: row.id };
}
