import type { AiProvider } from "@/lib/ai/keys";

export type AiModelOption = {
  id: string;
  label: string;
  /** Short hint for the picker (speed / quality). */
  hint: string;
};

/**
 * Picker and proxy allowlist. Compiled into the app, not loaded from
 * Anthropic or OpenAI, and not refreshed on a timer. A new id shows up
 * after an app update and a page reload. Every chat request runs
 * resolveModel, so a saved id that is no longer listed falls back to
 * that provider's first entry on the next send.
 *
 * The first entry is the default for people who have not picked a model.
 */
export const ANTHROPIC_MODELS: AiModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    hint: "Default · balanced",
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    hint: "Current · fast",
  },
  {
    id: "claude-opus-5-5",
    label: "Opus 5.5",
    hint: "Highest quality",
  },
  {
    id: "claude-fable-5-1",
    label: "Fable 5.1",
    hint: "Deep reasoning",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    hint: "Faster · cheaper",
  },
];

export const OPENAI_MODELS: AiModelOption[] = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    hint: "Default · fast",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    hint: "Higher quality",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    hint: "Fast · stronger",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    hint: "Strong writing",
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    hint: "Current · fast",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    hint: "Current · stronger",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    hint: "Highest quality",
  },
];

export function modelsForProvider(provider: AiProvider): AiModelOption[] {
  return provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
}

export function defaultModelForProvider(provider: AiProvider): string {
  return modelsForProvider(provider)[0].id;
}

export function resolveModel(
  provider: AiProvider,
  preferred?: string | null
): string {
  const options = modelsForProvider(provider);
  if (preferred && options.some((m) => m.id === preferred)) return preferred;
  return options[0].id;
}
