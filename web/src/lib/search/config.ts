import type { SearchProviderType } from "@/types/search";

export interface ProviderKeys {
  serpApiKey?: string;
  googleApiKey?: string;
  googleCseId?: string;
}

export function getSerpApiKey(override?: string): string | undefined {
  const key = override?.trim() || process.env.SERPAPI_KEY?.trim();
  return key || undefined;
}

export function isSerpApiConfigured(keys?: ProviderKeys): boolean {
  return Boolean(getSerpApiKey(keys?.serpApiKey));
}

export function isGoogleCseConfigured(keys?: ProviderKeys): boolean {
  const apiKey =
    keys?.googleApiKey?.trim() || process.env.GOOGLE_CSE_API_KEY?.trim();
  const cseId = keys?.googleCseId?.trim() || process.env.GOOGLE_CSE_ID?.trim();
  return Boolean(apiKey && cseId);
}

export function resolveActiveProvider(
  requested: SearchProviderType,
  keys?: ProviderKeys
): { provider: SearchProviderType; isLive: boolean; reason: string } {
  if (requested === "serpapi") {
    if (isSerpApiConfigured(keys)) {
      return {
        provider: "serpapi",
        isLive: true,
        reason: "SerpAPI configurada",
      };
    }
    return {
      provider: "serpapi",
      isLive: false,
      reason: "SerpAPI sem chave — fallback autônomo",
    };
  }

  if (requested === "autonomous") {
    return {
      provider: "autonomous",
      isLive: true,
      reason: "Modo 24h Autônomo — scraping DDG/Bing/Google",
    };
  }

  if (requested === "google-custom") {
    if (isGoogleCseConfigured(keys)) {
      return {
        provider: "google-custom",
        isLive: true,
        reason: "Google CSE configurado",
      };
    }
    return {
      provider: "google-custom",
      isLive: false,
      reason: "Google CSE ausente — usando mock",
    };
  }

  return {
    provider: "mock",
    isLive: false,
    reason: "Modo Mock selecionado",
  };
}

export function isSerpApiCreditError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("run out") ||
    msg.includes("quota") ||
    msg.includes("credit") ||
    msg.includes("exceeded") ||
    msg.includes("insufficient") ||
    msg.includes("monthly limit") ||
    msg.includes("search limit") ||
    msg.includes("has been exceeded")
  );
}