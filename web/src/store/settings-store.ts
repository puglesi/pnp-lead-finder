import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AUTONOMOUS_MIN_LEADS,
  AUTONOMOUS_STANDARD_MAX,
  DEFAULT_LEADS_PER_SECTOR,
  AUTONOMOUS_DELAY_MAX,
  AUTONOMOUS_DELAY_MIN,
  AUTONOMOUS_WORKERS_MAX,
  AUTONOMOUS_WORKERS_MIN,
  CUSTOM_LEADS_MIN,
  SERPAPI_EQUILIBRIUM_DEFAULT,
  SERPAPI_EQUILIBRIUM_MAX,
  SERPAPI_EQUILIBRIUM_MIN,
  SERPAPI_VOLUME_MAX,
  resolveEffectiveMaxResults,
} from "@/lib/search/volume";
import {
  DEFAULT_AUTONOMOUS_SINGLE_SOURCE,
  DEFAULT_AUTONOMOUS_SOURCE_STRATEGY,
  DEFAULT_AUTONOMOUS_SOURCES,
  isLegacyAutonomousSources,
  sanitizeAutonomousSources,
  sortSourcesByUkPriority,
  type AutonomousSourceId,
  type AutonomousSourceStrategy,
} from "@/types/autonomous-sources";
import {
  DEFAULT_NIGHT_SCHEDULE,
  getLocalProductionPhase,
  getProfileForPhase,
  type LocalProductionPhase,
} from "@/lib/local-production";
import type { EmailProviderCredentials, EmailProviderId } from "@/types/email-provider";
import type { QueueMode, SearchConfig, SearchProfile, SearchProviderType } from "@/types/search";
import {
  computeAutonomousDailyRemaining,
  settingsDayKey,
} from "@/lib/autonomous-daily-quota";

export {
  computeAutonomousDailyRemaining,
  computeAutonomousDailySentCount,
  settingsDayKey,
} from "@/lib/autonomous-daily-quota";

export type QuickSearchMode = "serpapi" | "autonomous-24h" | "google-cse";

export const SERPAPI_PROFILE_DEFAULTS = {
  workers: 6,
  delayMs: 500,
  maxResults: DEFAULT_LEADS_PER_SECTOR,
  useMaxLeads: false,
  queueMode: "parallel" as QueueMode,
  provider: "serpapi" as SearchProviderType,
  searchProfile: "serpapi" as SearchProfile,
  mode24h: false,
  autoSaveLeads: false,
  serpapiDeepPagination: false,
  autonomousSources: [...DEFAULT_AUTONOMOUS_SOURCES],
  autonomousSourceStrategy: DEFAULT_AUTONOMOUS_SOURCE_STRATEGY,
  autonomousSingleSource: DEFAULT_AUTONOMOUS_SINGLE_SOURCE,
  autonomousEnrichWebsites: true,
};

export const AUTONOMOUS_24H_DEFAULTS = {
  workers: 2,
  delayMs: 4000,
  maxResults: 200,
  useMaxLeads: false,
  queueMode: "sequential" as QueueMode,
  provider: "autonomous" as SearchProviderType,
  searchProfile: "autonomous-24h" as SearchProfile,
  mode24h: true,
  autoSaveLeads: true,
  serpapiDeepPagination: false,
  autonomousSources: [...DEFAULT_AUTONOMOUS_SOURCES],
  autonomousSourceStrategy: DEFAULT_AUTONOMOUS_SOURCE_STRATEGY,
  autonomousSingleSource: DEFAULT_AUTONOMOUS_SINGLE_SOURCE,
  autonomousEnrichWebsites: true,
};

/** @deprecated */
export const RYZEN9_DEFAULTS = SERPAPI_PROFILE_DEFAULTS;
/** @deprecated */
export const MODE_24H_DEFAULTS = AUTONOMOUS_24H_DEFAULTS;

interface SettingsStore extends SearchConfig {
  serpApiKey: string;
  googleApiKey: string;
  googleCseId: string;
  hardwareProfile: "ryzen9" | "standard";
  profileUserOverride: boolean;
  setMaxResults: (n: number) => void;
  setUseMaxLeads: (enabled: boolean) => void;
  setDelayMs: (n: number) => void;
  setWorkers: (n: number) => void;
  setProvider: (p: SearchProviderType) => void;
  setSearchProfile: (profile: SearchProfile, userInitiated?: boolean) => void;
  setMode24h: (enabled: boolean) => void;
  setQueueMode: (mode: QueueMode) => void;
  setAutoSaveLeads: (enabled: boolean) => void;
  setSerpapiDeepPagination: (enabled: boolean) => void;
  toggleAutonomousSource: (sourceId: AutonomousSourceId) => void;
  setAutonomousSources: (sources: AutonomousSourceId[]) => void;
  setAutonomousSourceStrategy: (strategy: AutonomousSourceStrategy) => void;
  setAutonomousSingleSource: (sourceId: AutonomousSourceId) => void;
  setAutonomousEnrichWebsites: (enabled: boolean) => void;
  getActiveAutonomousSources: () => AutonomousSourceId[];
  setSerpApiKey: (key: string) => void;
  setGoogleApiKey: (key: string) => void;
  setGoogleCseId: (id: string) => void;
  applySerpApiProfile: () => void;
  applyAutonomous24hProfile: () => void;
  applyRyzen9Profile: () => void;
  setQuickSearchMode: (mode: QuickSearchMode) => void;
  getActiveQuickSearchMode: () => QuickSearchMode;
  getSearchConfig: () => SearchConfig;
  getEffectiveMaxResults: () => number;
  getEffectiveWorkers: () => number;
  getDelayBounds: () => { min: number; max: number };
  emailProvider: EmailProviderId;
  mailgunApiKey: string;
  mailgunDomain: string;
  resendApiKey: string;
  sesAccessKey: string;
  sesSecretKey: string;
  sesRegion: string;
  sendgridApiKey: string;
  brevoApiKey: string;
  smtpEmail: string;
  smtpPassword: string;
  autonomousDailySentDate: string;
  autonomousDailySentCount: number;
  setEmailProvider: (id: EmailProviderId) => void;
  setMailgunConfig: (apiKey: string, domain: string) => void;
  setResendApiKey: (key: string) => void;
  setSesConfig: (accessKey: string, secretKey: string, region: string) => void;
  setSendgridApiKey: (key: string) => void;
  setBrevoApiKey: (key: string) => void;
  setSmtpConfig: (email: string, password: string) => void;
  resetAutonomousDailyCountIfNeeded: () => void;
  getAutonomousDailyRemaining: (limit: number) => number;
  incrementAutonomousDailySent: () => void;
  getEmailProviderCredentials: () => EmailProviderCredentials;
  localProductionEnabled: boolean;
  nightModeAuto: boolean;
  nightModeActive: boolean;
  nightScheduleStart: number;
  nightScheduleEnd: number;
  setLocalProductionEnabled: (enabled: boolean) => void;
  setNightModeAuto: (enabled: boolean) => void;
  setNightModeActive: (active: boolean) => void;
  setNightSchedule: (startHour: number, endHour: number) => void;
  applyLocalProductionProfile: () => void;
  applyLocalProductionPhase: (phase: LocalProductionPhase) => void;
  disableLocalProduction: () => void;
}

export function selectEmailProviderCredentials(
  s: Pick<
    SettingsStore,
    | "mailgunApiKey"
    | "mailgunDomain"
    | "resendApiKey"
    | "sesAccessKey"
    | "sesSecretKey"
    | "sesRegion"
    | "sendgridApiKey"
    | "brevoApiKey"
    | "smtpEmail"
    | "smtpPassword"
  >
): EmailProviderCredentials {
  return {
    mailgunApiKey: s.mailgunApiKey,
    mailgunDomain: s.mailgunDomain,
    resendApiKey: s.resendApiKey,
    sesAccessKey: s.sesAccessKey,
    sesSecretKey: s.sesSecretKey,
    sesRegion: s.sesRegion,
    sendgridApiKey: s.sendgridApiKey,
    brevoApiKey: s.brevoApiKey,
    smtpEmail: s.smtpEmail,
    smtpPassword: s.smtpPassword,
  };
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...AUTONOMOUS_24H_DEFAULTS,
      serpApiKey: "",
      googleApiKey: "",
      googleCseId: "",
      hardwareProfile: "ryzen9",
      profileUserOverride: false,
      emailProvider: "simulate" as EmailProviderId,
      mailgunApiKey: "",
      mailgunDomain: "",
      resendApiKey: "",
      sesAccessKey: "",
      sesSecretKey: "",
      sesRegion: "eu-west-1",
      sendgridApiKey: "",
      brevoApiKey: "",
      smtpEmail: "",
      smtpPassword: "",
      autonomousDailySentDate: settingsDayKey(),
      autonomousDailySentCount: 0,
      localProductionEnabled: false,
      nightModeAuto: true,
      nightModeActive: false,
      nightScheduleStart: DEFAULT_NIGHT_SCHEDULE.startHour,
      nightScheduleEnd: DEFAULT_NIGHT_SCHEDULE.endHour,

      setMaxResults: (maxResults) => {
        const isAutonomous = get().searchProfile === "autonomous-24h";
        const cap = isAutonomous
          ? AUTONOMOUS_STANDARD_MAX
          : SERPAPI_EQUILIBRIUM_MAX;
        const min = isAutonomous
          ? AUTONOMOUS_MIN_LEADS
          : SERPAPI_EQUILIBRIUM_MIN;
        set({
          maxResults: Math.min(cap, Math.max(min, maxResults)),
          useMaxLeads: false,
        });
      },

      setUseMaxLeads: (useMaxLeads) => {
        const isAutonomous = get().searchProfile === "autonomous-24h";
        set({
          useMaxLeads,
          ...(isAutonomous
            ? { autoSaveLeads: true, queueMode: "sequential" as QueueMode }
            : {}),
        });
      },

      setDelayMs: (delayMs) => {
        const { min, max } = get().getDelayBounds();
        set({ delayMs: Math.min(max, Math.max(min, delayMs)) });
      },

      setWorkers: (workers) => {
        const isAutonomous = get().searchProfile === "autonomous-24h";
        const min = isAutonomous ? AUTONOMOUS_WORKERS_MIN : 1;
        const max = isAutonomous ? AUTONOMOUS_WORKERS_MAX : 10;
        set({ workers: Math.min(max, Math.max(min, workers)) });
      },

      setProvider: (provider) => set({ provider }),

      setSearchProfile: (searchProfile, userInitiated = true) => {
        if (searchProfile === "autonomous-24h") {
          set({
            ...AUTONOMOUS_24H_DEFAULTS,
            serpApiKey: get().serpApiKey,
            ...(userInitiated ? { profileUserOverride: true } : {}),
          });
        } else {
          set({
            ...SERPAPI_PROFILE_DEFAULTS,
            provider: "serpapi",
            serpApiKey: get().serpApiKey,
            googleApiKey: get().googleApiKey,
            googleCseId: get().googleCseId,
            ...(userInitiated ? { profileUserOverride: true } : {}),
          });
        }
      },

      setQueueMode: (queueMode) => set({ queueMode }),
      setAutoSaveLeads: (autoSaveLeads) => set({ autoSaveLeads }),

      setSerpapiDeepPagination: (serpapiDeepPagination) =>
        set({ serpapiDeepPagination }),

      toggleAutonomousSource: (sourceId) => {
        const current = Array.isArray(get().autonomousSources)
          ? get().autonomousSources
          : [...DEFAULT_AUTONOMOUS_SOURCES];
        const next = current.includes(sourceId)
          ? current.filter((s) => s !== sourceId)
          : [...current, sourceId];
        set({
          autonomousSources: sanitizeAutonomousSources(
            next.length > 0 ? next : [DEFAULT_AUTONOMOUS_SINGLE_SOURCE]
          ),
        });
      },

      setAutonomousSources: (autonomousSources) =>
        set({
          autonomousSources: sanitizeAutonomousSources(autonomousSources),
        }),

      setAutonomousSourceStrategy: (autonomousSourceStrategy) =>
        set({ autonomousSourceStrategy }),

      setAutonomousSingleSource: (autonomousSingleSource) =>
        set({ autonomousSingleSource }),

      setAutonomousEnrichWebsites: (autonomousEnrichWebsites) =>
        set({ autonomousEnrichWebsites }),

      getActiveAutonomousSources: () => {
        const { autonomousSources, autonomousSourceStrategy, autonomousSingleSource } =
          get();
        // Exact incompatible field: autonomousSources may be null in legacy storage
        // when merge was the default shallow spread (no custom merge).
        const sources = Array.isArray(autonomousSources)
          ? autonomousSources
          : [...DEFAULT_AUTONOMOUS_SOURCES];
        if (autonomousSourceStrategy === "single") {
          return sources.includes(autonomousSingleSource)
            ? [autonomousSingleSource]
            : [sources[0] ?? DEFAULT_AUTONOMOUS_SINGLE_SOURCE];
        }
        return sortSourcesByUkPriority(sources);
      },

      setMode24h: (enabled) => {
        get().setSearchProfile(enabled ? "autonomous-24h" : "serpapi");
      },

      applySerpApiProfile: () => {
        set({
          ...SERPAPI_PROFILE_DEFAULTS,
          provider: "serpapi",
          serpApiKey: get().serpApiKey,
        });
      },

      applyAutonomous24hProfile: () => {
        set({ ...AUTONOMOUS_24H_DEFAULTS, serpApiKey: get().serpApiKey });
      },

      applyRyzen9Profile: () => get().applySerpApiProfile(),

      setQuickSearchMode: (mode) => {
        if (mode === "autonomous-24h") {
          set({
            ...AUTONOMOUS_24H_DEFAULTS,
            serpApiKey: get().serpApiKey,
            profileUserOverride: true,
          });
          return;
        }
        if (mode === "serpapi") {
          set({
            ...SERPAPI_PROFILE_DEFAULTS,
            serpApiKey: get().serpApiKey,
            googleApiKey: get().googleApiKey,
            googleCseId: get().googleCseId,
            profileUserOverride: true,
          });
          return;
        }
        set({
          searchProfile: "serpapi",
          provider: "google-custom",
          mode24h: false,
          profileUserOverride: true,
          serpApiKey: get().serpApiKey,
          googleApiKey: get().googleApiKey,
          googleCseId: get().googleCseId,
        });
      },

      getActiveQuickSearchMode: () => {
        const { searchProfile, provider } = get();
        if (searchProfile === "autonomous-24h" || provider === "autonomous") {
          return "autonomous-24h";
        }
        if (provider === "google-custom") return "google-cse";
        return "serpapi";
      },

      setSerpApiKey: (serpApiKey) => set({ serpApiKey }),
      setGoogleApiKey: (googleApiKey) => set({ googleApiKey }),
      setGoogleCseId: (googleCseId) => set({ googleCseId }),

      getDelayBounds: () => {
        if (get().searchProfile === "autonomous-24h") {
          return { min: AUTONOMOUS_DELAY_MIN, max: AUTONOMOUS_DELAY_MAX };
        }
        return { min: 500, max: 3000 };
      },

      getEffectiveWorkers: () => {
        const { workers, searchProfile, queueMode } = get();
        if (searchProfile === "autonomous-24h") {
          const clamped = Math.min(
            AUTONOMOUS_WORKERS_MAX,
            Math.max(AUTONOMOUS_WORKERS_MIN, workers)
          );
          return queueMode === "sequential" ? 1 : clamped;
        }
        if (queueMode === "sequential") return 1;
        return workers;
      },

      getEffectiveMaxResults: () => {
        const { maxResults, useMaxLeads, provider, searchProfile } = get();
        return resolveEffectiveMaxResults(
          maxResults,
          useMaxLeads,
          provider,
          searchProfile
        );
      },

      getSearchConfig: () => {
        const state = get();
        return {
          maxResults: state.getEffectiveMaxResults(),
          useMaxLeads: state.useMaxLeads,
          delayMs: state.delayMs,
          workers: state.getEffectiveWorkers(),
          provider: state.provider,
          searchProfile: state.searchProfile,
          mode24h: state.searchProfile === "autonomous-24h",
          queueMode: state.queueMode,
          autoSaveLeads: state.autoSaveLeads,
          serpapiDeepPagination: state.serpapiDeepPagination,
          autonomousSources: state.autonomousSources,
          autonomousSourceStrategy: state.autonomousSourceStrategy,
          autonomousSingleSource: state.autonomousSingleSource,
          autonomousEnrichWebsites: state.autonomousEnrichWebsites,
        };
      },

      setEmailProvider: (emailProvider) => set({ emailProvider }),
      setMailgunConfig: (mailgunApiKey, mailgunDomain) =>
        set({ mailgunApiKey, mailgunDomain }),
      setResendApiKey: (resendApiKey) => set({ resendApiKey }),
      setSesConfig: (sesAccessKey, sesSecretKey, sesRegion) =>
        set({ sesAccessKey, sesSecretKey, sesRegion }),
      setSendgridApiKey: (sendgridApiKey) => set({ sendgridApiKey }),
      setBrevoApiKey: (brevoApiKey) => set({ brevoApiKey }),
      setSmtpConfig: (smtpEmail, smtpPassword) => set({ smtpEmail, smtpPassword }),

      resetAutonomousDailyCountIfNeeded: () => {
        const day = settingsDayKey();
        if (get().autonomousDailySentDate !== day) {
          set({ autonomousDailySentDate: day, autonomousDailySentCount: 0 });
        }
      },

      getAutonomousDailyRemaining: (limit) => {
        const { autonomousDailySentDate, autonomousDailySentCount } = get();
        return computeAutonomousDailyRemaining(
          autonomousDailySentDate,
          autonomousDailySentCount,
          limit
        );
      },

      incrementAutonomousDailySent: () => {
        get().resetAutonomousDailyCountIfNeeded();
        set({ autonomousDailySentCount: get().autonomousDailySentCount + 1 });
      },

      getEmailProviderCredentials: () =>
        selectEmailProviderCredentials(get()),

      setLocalProductionEnabled: (localProductionEnabled) =>
        set({ localProductionEnabled }),

      setNightModeAuto: (nightModeAuto) => set({ nightModeAuto }),

      setNightModeActive: (nightModeActive) => set({ nightModeActive }),

      setNightSchedule: (nightScheduleStart, nightScheduleEnd) =>
        set({
          nightScheduleStart: Math.min(23, Math.max(0, Math.round(nightScheduleStart))),
          nightScheduleEnd: Math.min(23, Math.max(0, Math.round(nightScheduleEnd))),
        }),

      applyLocalProductionPhase: (phase) => {
        const profile = getProfileForPhase(phase);
        set({
          nightModeActive: phase === "night",
          workers: profile.workers,
          delayMs: profile.delayMs,
          queueMode: profile.queueMode,
          autoSaveLeads: profile.autoSaveLeads,
          autonomousEnrichWebsites: profile.autonomousEnrichWebsites,
        });
      },

      applyLocalProductionProfile: () => {
        const schedule = {
          startHour: get().nightScheduleStart,
          endHour: get().nightScheduleEnd,
        };
        const phase = getLocalProductionPhase(new Date(), schedule);
        const profile = getProfileForPhase(phase);
        set({
          ...AUTONOMOUS_24H_DEFAULTS,
          localProductionEnabled: true,
          nightModeAuto: true,
          nightModeActive: phase === "night",
          nightScheduleStart: get().nightScheduleStart,
          nightScheduleEnd: get().nightScheduleEnd,
          serpApiKey: get().serpApiKey,
          profileUserOverride: true,
          workers: profile.workers,
          delayMs: profile.delayMs,
          queueMode: profile.queueMode,
          autoSaveLeads: true,
          autonomousEnrichWebsites: profile.autonomousEnrichWebsites,
        });
      },

      disableLocalProduction: () => {
        set({
          localProductionEnabled: false,
          nightModeActive: false,
        });
      },
    }),
    {
      name: "pnp-settings",
      version: 13,
      migrate: (persisted, version) => {
        const state = persisted as Partial<SettingsStore> & {
          continuousLoop?: boolean;
        };
        if (!state || typeof state !== "object") return persisted;

        const next = { ...state } as Partial<SettingsStore> & {
          continuousLoop?: boolean;
        };

        if (version < 2) {
          if (next.provider === "mock") {
            if (next.searchProfile === "autonomous-24h") {
              next.provider = "autonomous";
            } else {
              next.provider = "serpapi";
              next.searchProfile = next.searchProfile ?? "serpapi";
            }
          }
        }

        if (version < 3) {
          delete next.continuousLoop;
          if (next.searchProfile === "autonomous-24h") {
            next.autoSaveLeads = next.autoSaveLeads ?? true;
            if (
              next.delayMs != null &&
              next.delayMs < AUTONOMOUS_DELAY_MIN
            ) {
              next.delayMs = AUTONOMOUS_24H_DEFAULTS.delayMs;
            }
          }
        }

        if (version < 4) {
          next.profileUserOverride = next.profileUserOverride ?? false;
        }

        if (version < 5) {
          if (
            next.maxResults != null &&
            next.maxResults < DEFAULT_LEADS_PER_SECTOR &&
            !next.useMaxLeads
          ) {
            next.maxResults = DEFAULT_LEADS_PER_SECTOR;
          }
        }

        if (version < 6) {
          next.serpapiDeepPagination = next.serpapiDeepPagination ?? false;
        }

        if (version < 7) {
          if (
            next.searchProfile === "serpapi" &&
            !next.useMaxLeads &&
            (next.maxResults == null ||
              next.maxResults > SERPAPI_EQUILIBRIUM_MAX ||
              next.maxResults < SERPAPI_EQUILIBRIUM_MIN)
          ) {
            next.maxResults = SERPAPI_EQUILIBRIUM_DEFAULT;
          }
        }

        if (version < 8) {
          if (next.searchProfile === "autonomous-24h") {
            next.autoSaveLeads = true;
            if (next.delayMs != null) {
              next.delayMs = Math.min(
                AUTONOMOUS_DELAY_MAX,
                Math.max(AUTONOMOUS_DELAY_MIN, next.delayMs)
              );
            }
          }
        }

        if (version < 9) {
          next.autonomousSources =
            next.autonomousSources ?? [...DEFAULT_AUTONOMOUS_SOURCES];
          next.autonomousSourceStrategy =
            next.autonomousSourceStrategy ?? DEFAULT_AUTONOMOUS_SOURCE_STRATEGY;
          next.autonomousSingleSource =
            next.autonomousSingleSource ?? DEFAULT_AUTONOMOUS_SINGLE_SOURCE;
          next.autonomousEnrichWebsites = next.autonomousEnrichWebsites ?? true;
        }

        if (version < 10) {
          if (isLegacyAutonomousSources(next.autonomousSources)) {
            next.autonomousSources = [...DEFAULT_AUTONOMOUS_SOURCES];
          } else {
            next.autonomousSources = sanitizeAutonomousSources(
              next.autonomousSources
            );
          }
        }

        if (version < 11) {
          next.emailProvider = next.emailProvider ?? "simulate";
          next.mailgunApiKey = next.mailgunApiKey ?? "";
          next.mailgunDomain = next.mailgunDomain ?? "";
          next.resendApiKey = next.resendApiKey ?? "";
          next.sesAccessKey = next.sesAccessKey ?? "";
          next.sesSecretKey = next.sesSecretKey ?? "";
          next.sesRegion = next.sesRegion ?? "eu-west-1";
          next.sendgridApiKey = next.sendgridApiKey ?? "";
        }

        if (version < 12) {
          next.brevoApiKey = next.brevoApiKey ?? "";
          next.smtpEmail = next.smtpEmail ?? "";
          next.smtpPassword = next.smtpPassword ?? "";
          next.autonomousDailySentDate = next.autonomousDailySentDate ?? settingsDayKey();
          next.autonomousDailySentCount = next.autonomousDailySentCount ?? 0;
        }

        if (version < 13) {
          next.localProductionEnabled = next.localProductionEnabled ?? false;
          next.nightModeAuto = next.nightModeAuto ?? true;
          next.nightModeActive = next.nightModeActive ?? false;
          next.nightScheduleStart =
            next.nightScheduleStart ?? DEFAULT_NIGHT_SCHEDULE.startHour;
          next.nightScheduleEnd =
            next.nightScheduleEnd ?? DEFAULT_NIGHT_SCHEDULE.endHour;
        }

        // Always repair array fields (not only on version bumps).
        next.autonomousSources = Array.isArray(next.autonomousSources)
          ? sanitizeAutonomousSources(next.autonomousSources)
          : [...DEFAULT_AUTONOMOUS_SOURCES];

        return next;
      },
      onRehydrateStorage: () => (state) => {
        state?.resetAutonomousDailyCountIfNeeded();
      },
      merge: (persisted, current) => {
        const state =
          persisted && typeof persisted === "object"
            ? (persisted as Partial<SettingsStore>)
            : {};
        // Exact field: autonomousSources null/undefined crashes .includes/.map on Dashboard.
        const autonomousSources = Array.isArray(state.autonomousSources)
          ? sanitizeAutonomousSources(state.autonomousSources)
          : current.autonomousSources;
        return {
          ...current,
          ...state,
          autonomousSources,
          autonomousSourceStrategy:
            state.autonomousSourceStrategy === "parallel" ||
            state.autonomousSourceStrategy === "rotate" ||
            state.autonomousSourceStrategy === "single"
              ? state.autonomousSourceStrategy
              : current.autonomousSourceStrategy,
          nightScheduleStart:
            typeof state.nightScheduleStart === "number"
              ? state.nightScheduleStart
              : current.nightScheduleStart,
          nightScheduleEnd:
            typeof state.nightScheduleEnd === "number"
              ? state.nightScheduleEnd
              : current.nightScheduleEnd,
          localProductionEnabled:
            typeof state.localProductionEnabled === "boolean"
              ? state.localProductionEnabled
              : current.localProductionEnabled,
          nightModeAuto:
            typeof state.nightModeAuto === "boolean"
              ? state.nightModeAuto
              : current.nightModeAuto,
          nightModeActive:
            typeof state.nightModeActive === "boolean"
              ? state.nightModeActive
              : current.nightModeActive,
        };
      },
    }
  )
);