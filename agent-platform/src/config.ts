// All settings come from the environment, so the same image runs anywhere. Nothing here is a secret by itself;
// `status()` reports which settings exist without ever printing a value.
const env = (name: string, fallback = '') => (process.env[name] ?? fallback).trim();

function parsePrices(raw: string): Record<string, [number, number]> {
  try {
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, [number, number]] => Array.isArray(entry[1]) && entry[1].length === 2 && entry[1].every((n) => typeof n === 'number')),
    );
  } catch {
    return {};
  }
}

export const config = {
  port: Number(env('PORT', '8080')),
  // Supabase (the shared self-hosted one). The service role writes runs; the anon key checks who is asking.
  supabaseUrl: env('SUPABASE_URL').replace(/\/+$/, ''),
  supabaseAnonKey: env('SUPABASE_ANON_KEY'),
  supabaseServiceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  // Coolify, read-only: the token should have the "read" permission only.
  coolifyUrl: env('COOLIFY_API_URL').replace(/\/+$/, '').replace(/\/api\/v1$/, ''),
  coolifyToken: env('COOLIFY_API_TOKEN'),
  // A second Coolify token that can restart and deploy. Optional: without it, approving an action fails with a clear message.
  coolifyWriteToken: env('COOLIFY_WRITE_TOKEN'),
  // Another system (a schedule, n8n) can start runs with this shared secret instead of a signed-in person.
  platformToken: env('PLATFORM_TOKEN'),
  anthropicKey: env('ANTHROPIC_API_KEY'),
  // Other providers: a provider is offered once its key is set. Mastra reads the same names itself.
  openaiKey: env('OPENAI_API_KEY'),
  googleKey: env('GOOGLE_GENERATIVE_AI_API_KEY'),
  opsModel: env('OPS_MODEL', 'anthropic/claude-sonnet-5-5'),
  // Page origins allowed to call this service from a browser.
  allowedOrigins: env('ALLOWED_ORIGINS', 'https://breadmakersystems.com,http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
  // The gateway, in its simplest form: a spend cap per day, and a kill switch.
  maxDailyUsd: Number(env('MAX_DAILY_USD', '5')),
  paused: env('AGENTS_PAUSED') === '1',
  // List price per million tokens, to estimate cost. Override when the price changes.
  priceInPerM: Number(env('PRICE_IN_PER_M', '3')),
  priceOutPerM: Number(env('PRICE_OUT_PER_M', '15')),
  // Per-model list prices when they differ from the line above: {"anthropic/claude-haiku-5-5":[1,5]} (input, output per million).
  modelPrices: parsePrices(env('MODEL_PRICES')),
  maxSteps: Number(env('MAX_STEPS', '12')),
  // What one member's own agents may spend in a calendar month (UTC), across every run and test.
  memberMonthlyUsd: Number(env('MEMBER_AGENT_MONTHLY_USD', '5')),
};

// The role a Supabase key carries (anon or service_role), read from the key's own payload. Never the key itself.
const roleOf = (key: string) => {
  try {
    return (JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8')) as { role?: string }).role ?? 'unknown';
  } catch {
    return key ? 'unreadable' : null;
  }
};

export function status() {
  const has = (value: string) => Boolean(value);
  return {
    supabase: has(config.supabaseUrl) && has(config.supabaseAnonKey) && has(config.supabaseServiceKey),
    coolify: has(config.coolifyUrl) && has(config.coolifyToken),
    supabaseKeyRoles: { anon: roleOf(config.supabaseAnonKey), service: roleOf(config.supabaseServiceKey) },
    coolifyWrite: has(config.coolifyWriteToken),
    anthropic: has(config.anthropicKey),
    providers: { anthropic: has(config.anthropicKey), openai: has(config.openaiKey), google: has(config.googleKey) },
    platformToken: has(config.platformToken),
    model: config.opsModel,
    maxDailyUsd: config.maxDailyUsd,
    memberMonthlyUsd: config.memberMonthlyUsd,
    paused: config.paused,
  };
}
