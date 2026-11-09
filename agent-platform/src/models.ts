// The model catalogue. Mastra reaches many providers by a "provider/model" name, so the platform's job is to know which
// ones it offers, whether a provider is connected (its key is set in Coolify), and what a model costs, because the daily
// spend cap is only as honest as the prices behind it.
import { config } from './config.ts';

export interface ModelInfo {
  id: string;
  provider: 'anthropic' | 'openai' | 'google';
  name: string;
  blurb: string;
  /** 1 to 5, relative: more speed is better, more quality is better, more cost is pricier. */
  speed: number;
  quality: number;
  cost: number;
  recommended?: boolean;
  /** The environment variable that connects this model's provider. */
  keyName: string;
}

export const CATALOG: ModelInfo[] = [
  { id: 'anthropic/claude-haiku-5-5', provider: 'anthropic', name: 'Haiku 5.5', blurb: 'Fast and light. Good for simple, repeated questions.', speed: 5, quality: 3, cost: 1, keyName: 'ANTHROPIC_API_KEY' },
  { id: 'anthropic/claude-sonnet-5-5', provider: 'anthropic', name: 'Sonnet 5.5', blurb: 'The all-round choice for most agents.', speed: 4, quality: 4, cost: 3, recommended: true, keyName: 'ANTHROPIC_API_KEY' },
  { id: 'anthropic/claude-opus-5-5', provider: 'anthropic', name: 'Opus 5.5', blurb: 'The strongest. For hard judgement, and the priciest.', speed: 2, quality: 5, cost: 5, keyName: 'ANTHROPIC_API_KEY' },
  { id: 'openai/gpt-6-luna', provider: 'openai', name: 'GPT-6 Luna', blurb: 'OpenAI’s lighter model, for simple questions at low cost.', speed: 5, quality: 3, cost: 1, keyName: 'OPENAI_API_KEY' },
  { id: 'openai/gpt-6.1-sol', provider: 'openai', name: 'GPT-6.1 Sol', blurb: 'OpenAI’s stronger all-round model.', speed: 3, quality: 5, cost: 4, keyName: 'OPENAI_API_KEY' },
  { id: 'google/gemini-3.8-flash', provider: 'google', name: 'Gemini 3.8 Flash', blurb: 'Google’s fast, low-cost model.', speed: 5, quality: 3, cost: 1, keyName: 'GOOGLE_GENERATIVE_AI_API_KEY' },
];

const KEYS: Record<ModelInfo['provider'], () => string> = {
  anthropic: () => config.anthropicKey,
  openai: () => config.openaiKey,
  google: () => config.googleKey,
};

export const isConnected = (model: ModelInfo) => Boolean(KEYS[model.provider]());

/** The models a member's own agents may use. Matches the database check on agent_defs. */
export const MEMBER_MODELS = ['anthropic/claude-haiku-5-5', 'anthropic/claude-sonnet-5-5'];

export const findModel = (id: string) => CATALOG.find((model) => model.id === id);

/**
 * The price used to estimate a run's cost: the one set for this model in MODEL_PRICES, or else the global estimate
 * (PRICE_IN_PER_M, PRICE_OUT_PER_M). Only a set price counts as known; the studio labels the rest as rough estimates.
 */
export function priceOf(id: string): { price: [number, number]; known: boolean } {
  const configured = config.modelPrices[id];
  return configured ? { price: configured, known: true } : { price: [config.priceInPerM, config.priceOutPerM], known: false };
}

/** What the studio shows: every model, whether it can be used now, and whether its cost figure is a real price. */
export const modelList = () =>
  CATALOG.map((model) => ({
    id: model.id,
    provider: model.provider,
    name: model.name,
    blurb: model.blurb,
    speed: model.speed,
    quality: model.quality,
    cost: model.cost,
    recommended: Boolean(model.recommended),
    available: isConnected(model),
    needs: isConnected(model) ? null : model.keyName,
    priceKnown: priceOf(model.id).known,
  }));
