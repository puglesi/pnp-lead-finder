"use client";

import { Moon, Search, Wifi } from "lucide-react";
import toast from "react-hot-toast";
import {
  useSettingsStore,
  type QuickSearchMode,
} from "@/store/settings-store";
import {
  AUTONOMOUS_MODE_LABEL,
  AUTONOMOUS_MODE_SHORT,
  GOOGLE_CSE_LABEL,
  SERPAPI_PREMIUM_LABEL,
  SERPAPI_PREMIUM_SHORT,
} from "@/lib/mode-labels";
import { cn } from "@/lib/utils";

const MODES: {
  id: QuickSearchMode;
  label: string;
  shortLabel: string;
  icon: typeof Moon;
  primary?: boolean;
}[] = [
  {
    id: "autonomous-24h",
    label: AUTONOMOUS_MODE_LABEL,
    shortLabel: AUTONOMOUS_MODE_SHORT,
    icon: Moon,
    primary: true,
  },
  {
    id: "google-cse",
    label: GOOGLE_CSE_LABEL,
    shortLabel: "Google",
    icon: Search,
  },
  {
    id: "serpapi",
    label: SERPAPI_PREMIUM_LABEL,
    shortLabel: SERPAPI_PREMIUM_SHORT,
    icon: Wifi,
  },
];

const TOAST: Record<QuickSearchMode, { message: string; icon: string }> = {
  "autonomous-24h": {
    message: `${AUTONOMOUS_MODE_LABEL} ativado`,
    icon: "🌙",
  },
  serpapi: { message: `${SERPAPI_PREMIUM_LABEL} ativado`, icon: "⚡" },
  "google-cse": { message: `${GOOGLE_CSE_LABEL} ativado`, icon: "🔍" },
};

export function ModeQuickSwitcher({ compact }: { compact?: boolean }) {
  const activeMode = useSettingsStore((s) => s.getActiveQuickSearchMode());
  const setQuickSearchMode = useSettingsStore((s) => s.setQuickSearchMode);

  const select = (mode: QuickSearchMode) => {
    if (mode === activeMode) return;
    setQuickSearchMode(mode);
    const t = TOAST[mode];
    toast.success(t.message, { icon: t.icon, duration: 3000 });
  };

  return (
    <div
      className={cn(
        "inline-flex rounded-xl border border-border/60 bg-background/50 p-1",
        compact ? "gap-0.5" : "gap-1"
      )}
      role="group"
      aria-label="Modo de busca"
    >
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const isActive = activeMode === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => select(mode.id)}
            title={mode.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              compact && "px-2.5 py-1.5 text-xs",
              isActive
                ? mode.id === "autonomous-24h"
                  ? "bg-indigo-500/25 text-indigo-900 shadow-sm ring-1 ring-indigo-400/30 dark:text-indigo-100"
                  : mode.id === "google-cse"
                    ? "bg-blue-500/20 text-blue-800 shadow-sm dark:text-blue-200"
                    : "bg-emerald-500/15 text-emerald-800 shadow-sm dark:text-emerald-200"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              mode.primary && !isActive && "font-semibold"
            )}
          >
            <Icon className={cn("shrink-0", compact ? "size-3.5" : "size-4")} />
            <span className="hidden sm:inline">{mode.label}</span>
            <span className="sm:hidden">{mode.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
