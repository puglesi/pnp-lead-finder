/**
 * Display helpers so Settings UI SSR matches the first client paint.
 * Persisted values (e.g. maxResults 160) apply only after hydration.
 *
 * Must stay aligned with AUTONOMOUS_24H_DEFAULTS in settings-store
 * (initial store create state for SSR).
 */
import type { SearchProfile, SearchProviderType } from "../types/search.ts";

/** Mirrors store initial autonomous defaults used on the server. */
export const SETTINGS_SSR_DISPLAY_DEFAULTS = {
  searchProfile: "autonomous-24h" as SearchProfile,
  provider: "autonomous" as SearchProviderType,
  maxResults: 200,
  useMaxLeads: false,
  delayMs: 4000,
  workers: 2,
  queueMode: "sequential" as const,
  serpApiKey: "",
  googleApiKey: "",
  googleCseId: "",
};

export function getSettingsSsrDisplayDefaults() {
  return { ...SETTINGS_SSR_DISPLAY_DEFAULTS };
}

/**
 * Values safe to render in text for volume summary.
 * Before hydration always returns SSR defaults so React does not mismatch.
 */
export function getSettingsVolumeDisplay(input: {
  hydrated: boolean;
  effectiveMaxResults: number;
  effectiveWorkers: number;
  delayMs: number;
  searchProfile: SearchProfile;
  useMaxLeads: boolean;
}): {
  effectiveMaxResults: number;
  effectiveWorkers: number;
  delayMs: number;
  isAutonomous: boolean;
  useMaxLeads: boolean;
} {
  if (!input.hydrated) {
    const d = SETTINGS_SSR_DISPLAY_DEFAULTS;
    return {
      effectiveMaxResults: d.maxResults,
      effectiveWorkers: d.workers,
      delayMs: d.delayMs,
      isAutonomous: d.searchProfile === "autonomous-24h",
      useMaxLeads: d.useMaxLeads,
    };
  }
  return {
    effectiveMaxResults: input.effectiveMaxResults,
    effectiveWorkers: input.effectiveWorkers,
    delayMs: input.delayMs,
    isAutonomous: input.searchProfile === "autonomous-24h",
    useMaxLeads: input.useMaxLeads,
  };
}
