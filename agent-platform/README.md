# agent-platform

One service that runs Breadmaker's (and later Restart's) agents on [Mastra](https://mastra.ai), records every run in
`breadmaker.agent_runs`, and exposes a small HTTP API. The studio's **Agents > Runs** page reads the runs and starts new ones.

Phase 1: one agent, **Ops**, with read-only tools (Coolify status/logs/deployments, HTTP and DNS checks, funnel build status).
Nothing here can change a server, a record or a message. Phase 2 adds actions behind an approval queue.

## API

| Route | Who | What |
|---|---|---|
| `GET /healthz` | anyone | liveness |
| `GET /status` | anyone | which settings exist (never their values), the agents and the tools |
| `POST /run` `{agent:"ops", input:"..."}` | Breadmaker team (Supabase JWT) or `PLATFORM_TOKEN` | starts a run, returns `202 {runId}`; read the run from `agent_runs` |

## Settings (Coolify environment variables)

| Name | Needed | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | the model key |
| `SUPABASE_URL` | yes | `https://db.restart.ng` |
| `SUPABASE_ANON_KEY` | yes | checks who is asking |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | writes run records; keep it here only |
| `COOLIFY_API_URL`, `COOLIFY_API_TOKEN` | yes | give the token the **read** permission only |
| `PLATFORM_TOKEN` | no | lets a schedule or n8n start runs |
| `ALLOWED_ORIGINS` | no | default `https://breadmakersystems.com,http://localhost:3000` |
| `OPS_MODEL` | no | default `anthropic/claude-sonnet-5-5` |
| `MAX_DAILY_USD` | no | spend cap per UTC day, default 5 |
| `AGENTS_PAUSED` | no | `1` stops all new runs (kill switch) |
| `PRICE_IN_PER_M`, `PRICE_OUT_PER_M` | no | list price per million tokens, to estimate cost (default 3 and 15) |

## Develop

```bash
npm ci
npm run check   # types
npm test        # no key or network needed: a scripted model and fake Supabase/Coolify
```
