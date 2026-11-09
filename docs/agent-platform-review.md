# Agent platform review: Mastra dashboard vs our consoles

Reviewed 2026-11-04 from the Mastra Platform project `Restart Inc. / Starter agent` (read-only), the Restart console
(`C:\Projects\restart-inc`) and the Breadmaker Hub (`C:\Projects\BreadmakerSys`). Purpose: decide how to build an
agent-first platform for Restart Inc. and Breadmaker, and what to take from Mastra's dashboard.

## 1. What the Mastra dashboard is

One project = one deployed agent app. Everything is keyed to agent runs.

| Area | What it shows |
|---|---|
| Overview | Live status, environment (production, US), deploy age, links to the Studio and the Server URL, the database (Neon), observability status, a 7-day activity strip, recent deploys, a setup checklist (3/5), credits. |
| Metrics | Tokens (input, cache read, output), agent runs (completed, failed), latency P50/P95/P99, resources and threads, a per-agent table (errors, P95, tokens, cost, traces, change), scores. |
| Traces | One row per run: primitive type, name, input, output, outcome, stop reason, duration, estimated cost. |
| Intelligence | Analysis over traces (was still loading). |
| Logs, Requests | Server logs, and requests to the deployed server. |
| Deploys | Source branch, commit, environment, status, age. |
| Gateway | Spend, requests, tokens and latency by model; spend by API key. |
| Databases | A managed database per environment. |
| Connect | Connections to integrations, with capabilities and an activity log of what agents did through them. |
| Workspaces | Persistent storage and sandboxes for agents. |
| Environments, Settings, Alerts | Environments, GitHub link, plan (serverless pay-as-you-go $0, persistent server $100/month), alert rules, delete with a 48-hour restore. |

What it does not show (in this project): an approvals queue, a business view (clients, money, tasks), or tenant separation.
It is an operations view of the agent itself, not of a business.

## 2. What we already have

**Restart console** (React, Supabase, Coolify):
- Client console: overview, systems, delivery, tasks, timeline, activity, support, billing and SLA.
- Admin: overview, attention, clients, projects, leads, prospects (outreach), support, tasks, team, email, server requests.
- Finance: invoices, payments, cashflow, costs, expenses, hosting, domains, deployments, VAT, reports.
- Agent pieces already in production:
  - `console-agent-run` (cron follow-up agent). It can only propose; a person approves; `console-agent-send` sends under the admin's own session.
  - `console-ops-mcp`: projects, tasks and teammates over MCP, with tiered tokens (ops, owner/finance). Every write leaves an "agent" entry on the timeline. It never deletes, sends, bills or changes infrastructure.
  - `console-outreach-mcp`: prospect memory and drafts; nothing sends.
  - `console-admin-infra` and `console-data`: Coolify access held server-side so the token never reaches a browser.
- Patterns worth keeping: propose then approve, tiered tokens, an audit trail on the timeline, the caller's JWT enforced by RLS.

**Breadmaker Hub:** Funnels, Agents (blueprints, setup steps, enquiry-based overview), Integrations, Studio. No agent runtime yet.

## 3. Gaps against Mastra's model

1. **No run record.** Agent work happens in cron functions and MCP calls with no trace: no input, output, tool calls, duration, tokens or cost per run.
2. **No per-agent metrics, cost or latency, and no scores (evals).**
3. **No model gateway.** Model calls are made directly from functions, with no spend cap per agent or tenant.
4. **No tool registry.** Tools are hard-coded inside each MCP function, with no list of capabilities, who may use them, or what they did.
5. **No agent studio.** Nowhere to chat with an agent, replay a run, or compare a change before shipping it.
6. **No durable workflows.** Multi-step jobs (deploy, onboarding, follow-up sequences) have no pause, resume or retry state of their own.
7. **No environments or alerts for agents.**

Where we are ahead: Mastra's dashboard has no approvals queue or business context. Ours does, and that is the part that makes agents safe to give real access.

## 4. Proposal

Build one agent platform used by Restart and Breadmaker, with Mastra as the framework (self-hosted on Coolify, Postgres in Supabase), and copy Mastra's dashboard structure for the control views.

- **Spine: runs.** Every agent run writes a row: tenant, agent, trigger, input, output, tool calls, outcome, stop reason, duration, tokens, cost. Metrics, traces, scores and alerts are views over this.
- **Tool registry ("Connect").** Each tool has: name, system (Coolify, Supabase, Lago, Kumoda, GitHub, Cloudflare), risk level (read, reversible write, destructive or money-moving), and which agents may use it. Destructive and money-moving tools always require an approval.
- **Approvals queue.** One queue for all tenants, building on `agent_proposal` rows.
- **Gateway.** One place for model calls with a budget per agent and tenant, and a kill switch.
- **Workflows** for deploy (build, verify, promote or roll back), onboarding, billing reminders and follow-up sequences.
- **Console pages** modelled on Mastra's: Overview, Runs, Metrics, Tools, Approvals, Deploys (agent versions), Alerts.
- **Plain code stays plain:** billing (patched Lago), payments, invoicing. Agents trigger and monitor them; they never move money.

Keep the Mastra Cloud project as a learning sandbox only. Production runs on Coolify, because run records contain client data and Mastra Cloud's default region is US.

## 5. Phases

0. **Deploy functions from git** (replace the `deploy-*.sh` and pasted installers with a push that deploys and checksums).
1. **Platform skeleton:** Mastra service on Coolify, runs table, a read-only Ops agent (diagnose a site from Coolify, logs, DNS), Runs and Metrics pages.
2. **Approval-gated actions:** restart, redeploy, roll back; the Approvals queue; audit entries.
3. **Breadmaker Qualifier** on the same platform (reads `funnel_leads`, drafts replies, hands over for approval).
4. **Move console jobs behind agents:** support triage, billing reminders, outreach.
5. **Agent-native console**, once agents have earned trust.

## 6. Risks

- Mastra v1.0 shipped in January 2026; pin exact versions and audit packages (one review reports a June 2026 supply-chain incident, not verified).
- Infrastructure must not depend on model chance: fixed workflows and approvals, the model only proposes.
- Token cost: budgets, caching, smaller models for routine steps.
- A second service to run and monitor.
