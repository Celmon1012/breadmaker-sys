# Plan: Breadmaker agents on the full Mastra platform, Restart as first customer

Rewritten 2026-11-05. This replaces the earlier plan to move the platform into Restart's repo.

## The decision

Agents are a Breadmaker product, with the full Mastra platform behind them (workflows, memory, MCP tools, sub-agents,
evals, human approval). The Leak Test names the weakest pillar; an agent goes after that leak.
Restart is the first customer of the platform, a `tenant` on the same runs table, and its operator (the domain is
`agents.restart.ng`; the service stays in this repo). Nothing moves.

**The gate, not an org chart:** Breadmaker only offers an agent to members once it has run for Restart (or Ademola).
Restart is the proof, and the runs table is where it shows.

## What exists today

- `agent-platform/` (Mastra, Ops agent, read-only tools, run records in `breadmaker.agent_runs`, daily spend cap, kill
  switch, team-only access) live at `https://agents.restart.ng`. Studio > Agents shows runs, metrics and tools.
- Hub Agents and Templates (the four funnel blueprints: Qualifier, Nurturer, Educator, Funnel manager): design-only,
  copy says they send nothing until the runtime is connected.
- Restart already runs, outside the platform: a follow-up agent that drafts and a person approves (cron), automatic
  overdue-invoice reminders, and drafted support replies approved by a person.

## Leak areas and the agent for each

| Leak area | Agent | Proof today |
|---|---|---|
| Sales & Lead Flow | Follow-up agent (Qualifier, Nurturer) | Restart's follow-up agent (runs daily, person approves) |
| Finance & Cash | Payment reminders | Restart's automatic invoice reminders (automation, not yet an agent) |
| Operations & Systems | Support triage agent | Restart drafts support replies, person approves |
| Tech & Automation | Ops agent | On the platform now, every run recorded |
| Team & Owner Dependence | Handover assistant | In design |
| Offer & Positioning | not an agent: a page or funnel fix | n/a |

The Leak Test result now shows this under "An agent that works on this leak", with a badge that says whether it runs
at Restart, on the platform, or is still in design (`src/lib/leak-agents.ts`; nothing may say "runs" unless it does).

## Phases

**1. Leak Test points to the agent (done in this change).** Mapping, honest badges.

**2. Put Restart's own agents behind the platform.** Each gets run records, so the proof is visible:
   follow-up agent first (leak: Sales), then support triage, then payment reminders as an agent that drafts
   messages. They stay under human approval; the platform records what they did. Restart's console reads its tenant's
   runs from the same table.

**3. Member-facing agent pages, modelled on the reference designs** (agent detail with handled-without-you rate,
   why it handed off, questions it could not answer, versions with rollback; a setup wizard with purpose, identity,
   model cards with speed/quality/cost, knowledge, guardrails, live preview and test; a launch checklist). The Hub
   Agents page becomes this. Agent definitions are stored as data; Mastra builds the agent from the definition.

**4. Platform capabilities from Mastra, in this order:** approvals queue and tool risk tiers (propose then approve,
   reusing Restart's pattern); evals and scorers on runs; memory and knowledge per agent; workflows for multi-step jobs
   (deploy, onboarding, follow-up sequences); per-agent budgets in the gateway.

**5. Members' agents.** A member's agent runs on the platform under their own tenant, only from catalogue entries
   that have run for Restart. Needs per-tenant data separation and billing (usage priced from run cost).

## Open items

- **Funnels:** Restart runs no funnels beyond the Scorecard page, so Launchpad has no Restart proof. Recommendation
  unchanged: dogfood one Restart funnel on the Launchpad engine, put the Qualifier on it, publish the numbers. Until
  then Launchpad copy must not claim Restart-tested results.
- **Tenancy:** before any member agent runs, add a tenant per member (or per workspace) to `agent_runs` and RLS by it.
- **Console surface for Restart:** a page in Restart's console that reads tenant `restart` runs (later; the Studio page
  serves the team now).

## Risks

- Run records hold client details: RLS by tenant before members' agents exist.
- Agents that write to customers stay behind approval until their scores justify more.
- The platform is one more service to watch; Ops watches it (it reports on itself).
