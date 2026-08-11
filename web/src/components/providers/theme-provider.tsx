"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  applyThemeToDocument,
  resolveTheme,
  useThemeStore,
} from "@/store/theme-store";

function subscribeSystem(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => onChange();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

function getSystemDark() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useThemeStore((s) => s.preference);
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    getSystemDark,
    () => true
  );

  useEffect(() => {
    applyThemeToDocument(resolveTheme(preference, systemDark));
  }, [preference, systemDark]);

  return children;
}
