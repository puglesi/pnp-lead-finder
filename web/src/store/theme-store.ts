import { create } from "zustand";
import { persist } from "zustand/middleware";
import { normalizeThemePersistSlice } from "../lib/store-rehydrate.ts";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeStore {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      preference: "system",
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: "pnp-theme",
      version: 1,
      migrate: (persisted) => normalizeThemePersistSlice(persisted),
      merge: (persisted, current) => {
        const normalized = normalizeThemePersistSlice(persisted);
        return {
          ...current,
          preference: isThemePreference(normalized.preference)
            ? normalized.preference
            : current.preference,
        };
      },
    }
  )
);

export function resolveTheme(
  preference: ThemePreference | null | undefined,
  systemDark: boolean
): "light" | "dark" {
  if (preference === "light" || preference === "dark") return preference;
  return systemDark ? "dark" : "light";
}

export function applyThemeToDocument(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
  root.dataset.theme = theme;
}
