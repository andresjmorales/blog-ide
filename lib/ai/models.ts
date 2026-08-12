import type { AiProvider } from "@/lib/ai/keys";

export type AiModelOption = {
  id: string;
  label: string;
  /** Short hint for the picker (speed / quality). */
  hint: string;
};

/** Light picker — a few solid defaults; proxy no longer hardcodes one model. */
export const ANTHROPIC_MODELS: AiModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    hint: "Default · balanced",
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
