# Making Evo CRM agentic

Evo CRM has its own agent engine: LLM agents with a system prompt, custom HTTP tools, MCP servers, an agent loop that calls
tools until it has an answer, and an agent bot you attach to an inbox. This pack reuses what the Kumoda + n8n agent already
has (prompt, knowledge, the `agent-tools` function), so the CRM agent answers from the same facts and the same guard rails.

The CRM keeps LLM keys and tool secrets in its own forms, so a person has to type them once. Everything else below is ready
to paste. About 15 minutes.

## 1. Add the model key
CRM → AI Agents → API Keys → New. Provider Anthropic, your Claude key. Name it `anthropic-main`.
Use a key that is capped in the Anthropic console; the agent loop can make several calls per message.

## 2. Add the three tools (custom HTTP tools)
CRM → AI Agents → Tools → New custom tool. All three are `POST https://db.restart.ng/functions/v1/agent-tools` with header
`x-agent-secret: <AGENT_TOOLS_SECRET>` (the value on the edge-functions container in Coolify) and `Content-Type: application/json`.

| Tool name | Description for the model | Body |
|---|---|---|
| `get_prices` | Live Breadmaker prices. Call before stating any amount of money. | `{"tool":"get_prices","args":{}}` |
| `lookup_customer` | What we hold for the person writing, by their WhatsApp number. Read only. | `{"tool":"lookup_customer","args":{"phone":"{{phone}}"}}` with parameter `phone` (string, required) |
| `check_cohort` | Next Launchpad and Foundry start dates and places left. | `{"tool":"check_cohort","args":{}}` |

Hand-over needs no custom tool: the CRM can assign the conversation to a person and return it to the bot.

## 3. Create the agent
CRM → AI Agents → New agent.
- Name `Breadmaker Assistant`, model `claude-sonnet-5-5`, temperature 0.2, key `anthropic-main`.
- Instructions: the text of [docs/agent/system-prompt.md](agent/system-prompt.md) below its divider line, with two edits: the
  `hand_over` bullet becomes "when you cannot help, say you are passing this to Ademola's team and stop replying", and delete the
  n8n sentence. Append the knowledge from `node scripts/build-agent-knowledge.mjs`.
- Tools: the three above. Turn on the agent loop with a maximum of 5 steps.
- Guard rails already in the prompt: prices only from `get_prices`, links only from the knowledge list, no promises of earnings.

Test it in the agent's own chat before attaching it anywhere: ask for the Launchpad price, ask for a refund (it must hand over),
ask about someone else's result (it must refuse).

## 4. Give it a channel
- **WhatsApp through Evolution API.** Your `evolution-api` service already runs. CRM → Settings → Inboxes → New → WhatsApp →
  Evolution, then scan the QR code. Attach the agent as the inbox's agent bot.
- **Or keep Kumoda as the WhatsApp line** and have Kumoda forward messages to the CRM's API inbox. Decide this before building
  more: two WhatsApp inboxes for the same number will fight.

## 5. Let the agent see the CRM (MCP)
The CRM can register MCP servers for an agent (AI Agents → MCP Servers). Useful ones, in order:
1. Your own `agent-tools` as an MCP server later, so prices and cohorts are one definition for both agents.
2. Cal.com (you already run it) so the agent can offer real call slots.
Add them only when the first version has run for a week; every tool is something the model can misuse.

## 6. Connect n8n
CRM → Settings → Webhooks → add your n8n webhook URL for `conversation_created`, `message_created` and `contact_updated`.
Use n8n for what an agent should not do alone: send the hot-lead WhatsApp to you, create Cal.com bookings, post to Slack.

## What the sync already gives the agent
Every contact carries `lead_priority`, `lead_score`, `lifecycle_stage`, `biggest_leak`, programme, membership and open-ticket
fields (see [CRM-SYNC.md](CRM-SYNC.md)), so a rule or an agent can branch on them: a hot lead goes to a human at once, a
`support_open` member gets the support answer first.
