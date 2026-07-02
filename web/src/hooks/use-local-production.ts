"use client";

import { useEffect, useRef } from "react";
import {
  getLocalProductionPhase,
  LOCAL_PRODUCTION_CHECK_INTERVAL_MS,
} from "@/lib/local-production";
import { useSettingsStore } from "@/store/settings-store";

export function useLocalProduction() {
  const localProductionEnabled = useSettingsStore(
    (s) => s.localProductionEnabled
  );
  const nightModeAuto = useSettingsStore((s) => s.nightModeAuto);
  const nightScheduleStart = useSettingsStore((s) => s.nightScheduleStart);
  const nightScheduleEnd = useSettingsStore((s) => s.nightScheduleEnd);
  const nightModeActive = useSettingsStore((s) => s.nightModeActive);
  const applyLocalProductionPhase = useSettingsStore(
    (s) => s.applyLocalProductionPhase
  );
  const setNightModeActive = useSettingsStore((s) => s.setNightModeActive);

  const lastPhase = useRef<"day" | "night" | null>(null);

  useEffect(() => {
    if (!localProductionEnabled || !nightModeAuto) return;

    const schedule = {
      startHour: nightScheduleStart,
      endHour: nightScheduleEnd,
    };

    const syncPhase = () => {
      const phase = getLocalProductionPhase(new Date(), schedule);
      if (lastPhase.current === phase) return;
      lastPhase.current = phase;
      applyLocalProductionPhase(phase);
    };

    syncPhase();
    const timer = setInterval(syncPhase, LOCAL_PRODUCTION_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [
    localProductionEnabled,
    nightModeAuto,
    nightScheduleStart,
    nightScheduleEnd,
    applyLocalProductionPhase,
  ]);

  useEffect(() => {
    if (!localProductionEnabled || nightModeAuto) return;
    if (nightModeActive) {
      applyLocalProductionPhase("night");
      lastPhase.current = "night";
    } else {
      applyLocalProductionPhase("day");
      lastPhase.current = "day";
    }
  }, [
    localProductionEnabled,
    nightModeAuto,
    nightModeActive,
    applyLocalProductionPhase,
  ]);
}