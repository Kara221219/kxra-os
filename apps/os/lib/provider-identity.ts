/** Presentation only. Never infer provider identity from a model or endpoint. */
export type ProviderIdentityDefinition = {
  label: string;
  mark?: { src: string; width: number; height: number };
};
const identities: Record<string, ProviderIdentityDefinition> = {
  OPENAI: {
    label: "OpenAI API",
    mark: { src: "/providers/openai-blossom-black.svg", width: 40, height: 40 },
  },
  ANTHROPIC: { label: "Anthropic" },
  GOOGLE: { label: "Google" },
  OPENROUTER: {
    label: "OpenRouter",
    mark: { src: "/providers/openrouter-glyph-ink.svg", width: 28, height: 20 },
  },
  COMPATIBLE: { label: "Compatible provider" },
  FIXTURE: { label: "Local fixture" },
  CHATGPT_SUBSCRIPTION: { label: "ChatGPT subscription" },
};
export function providerIdentity(provider: string): ProviderIdentityDefinition {
  return Object.hasOwn(identities, provider)
    ? identities[provider]
    : { label: provider || "Unknown provider" };
}
