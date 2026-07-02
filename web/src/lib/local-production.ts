import {
  AUTONOMOUS_DELAY_MAX,
  AUTONOMOUS_DELAY_MIN,
} from "@/lib/search/volume";
import type { QueueMode } from "@/types/search";

export type LocalProductionPhase = "day" | "night";

export interface NightModeSchedule {
  startHour: number;
  endHour: number;
}

export interface LocalProductionProfile {
  workers: number;
  delayMs: number;
  queueMode: QueueMode;
  autoSaveLeads: boolean;
  autonomousEnrichWebsites: boolean;
  trackingPollMs: number;
}

export const DEFAULT_NIGHT_SCHEDULE: NightModeSchedule = {
  startHour: 22,
  endHour: 7,
};

export const LOCAL_PRODUCTION_DAY_PROFILE: LocalProductionProfile = {
  workers: 2,
  delayMs: AUTONOMOUS_DELAY_MIN,
  queueMode: "parallel",
  autoSaveLeads: true,
  autonomousEnrichWebsites: true,
  trackingPollMs: 20_000,
};

export const LOCAL_PRODUCTION_NIGHT_PROFILE: LocalProductionProfile = {
  workers: 1,
  delayMs: AUTONOMOUS_DELAY_MAX,
  queueMode: "sequential",
  autoSaveLeads: true,
  autonomousEnrichWebsites: false,
  trackingPollMs: 90_000,
};

export const LOCAL_PRODUCTION_CHECK_INTERVAL_MS = 60_000;

export function clampHour(hour: number): number {
  return Math.min(23, Math.max(0, Math.round(hour)));
}

export function isNightHour(
  hour: number,
  schedule: NightModeSchedule = DEFAULT_NIGHT_SCHEDULE
): boolean {
  const start = clampHour(schedule.startHour);
  const end = clampHour(schedule.endHour);
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function getLocalProductionPhase(
  now = new Date(),
  schedule: NightModeSchedule = DEFAULT_NIGHT_SCHEDULE
): LocalProductionPhase {
  return isNightHour(now.getHours(), schedule) ? "night" : "day";
}

export function getProfileForPhase(
  phase: LocalProductionPhase
): LocalProductionProfile {
  return phase === "night"
    ? LOCAL_PRODUCTION_NIGHT_PROFILE
    : LOCAL_PRODUCTION_DAY_PROFILE;
}

export function getTrackingPollInterval(
  localProductionEnabled: boolean,
  nightModeActive: boolean
): number {
  if (!localProductionEnabled) return 20_000;
  return nightModeActive
    ? LOCAL_PRODUCTION_NIGHT_PROFILE.trackingPollMs
    : LOCAL_PRODUCTION_DAY_PROFILE.trackingPollMs;
}

export function formatNightSchedule(
  schedule: NightModeSchedule = DEFAULT_NIGHT_SCHEDULE
): string {
  const pad = (h: number) => `${clampHour(h).toString().padStart(2, "0")}:00`;
  return `${pad(schedule.startHour)} – ${pad(schedule.endHour)}`;
}