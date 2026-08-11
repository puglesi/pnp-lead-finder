"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Layers, Pickaxe, Rocket } from "lucide-react";
import { AgentOneGarimpeiro } from "@/components/agents/agent-one-garimpeiro";
import { OneClickOutreach } from "@/components/outreach/one-click-outreach";
import { QuickSearch } from "@/components/dashboard/quick-search";
import { BulkSearchProgress } from "@/components/dashboard/bulk-search-progress";
import { cn } from "@/lib/utils";

export type AgentOneSearchMode = "garimpeiro" | "one-click" | "bulk";

const MODES: {
  id: AgentOneSearchMode;
  label: string;
  description: string;
  icon: typeof Pickaxe;
}[] = [
  {
    id: "garimpeiro",
    label: "Garimpeiro",
    description: "Fila de setores e enriquecimento",
    icon: Pickaxe,
  },
  {
    id: "one-click",
    label: "One-Click",
    description: "Prospecção completa em um clique",
    icon: Rocket,
  },
  {
    id: "bulk",
    label: "Busca em Massa",
    description: "Volume multi-setor",
    icon: Layers,
  },
];

const STORAGE_KEY = "pnp:agent-1-search-mode";
const MODE_CHANGE_EVENT = "pnp:agent-1-search-mode-change";

function isAgentOneSearchMode(
  value: string | null | undefined
): value is AgentOneSearchMode {
  return value === "one-click" || value === "bulk" || value === "garimpeiro";
}

function readStoredMode(): AgentOneSearchMode {
  if (typeof window === "undefined") return "garimpeiro";
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (isAgentOneSearchMode(value)) return value;
  } catch {
    // ignore
  }
  return "garimpeiro";
}

function modeFromSearchParams(
  params: URLSearchParams | null
): AgentOneSearchMode | null {
  const mode = params?.get("mode");
  if (isAgentOneSearchMode(mode)) return mode;
  // batchId implies garimpeiro lote mode
  if (params?.get("batchId")) return "garimpeiro";
  return null;
}

function subscribeMode(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(MODE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(MODE_CHANGE_EVENT, onStoreChange);
  };
}

export function AgentOneSearchModes() {
  const searchParams = useSearchParams();
  const storedMode = useSyncExternalStore(
    subscribeMode,
    readStoredMode,
    () => "garimpeiro" as AgentOneSearchMode
  );
  const [manualMode, setManualMode] = useState<AgentOneSearchMode | null>(null);

  const urlMode = modeFromSearchParams(searchParams);
  const mode = urlMode ?? manualMode ?? storedMode;

  const selectMode = useCallback((next: AgentOneSearchMode) => {
    setManualMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          Modo de busca
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectMode(item.id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                  active
                    ? "border-primary/50 bg-primary/10 shadow-md shadow-primary/10"
                    : "border-border/60 bg-card/40 hover:border-primary/30 hover:bg-accent/40"
                )}
                aria-pressed={active}
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                    active
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "font-semibold",
                      active ? "text-primary" : "text-foreground"
                    )}
                  >
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {mode === "garimpeiro" && <AgentOneGarimpeiro />}
      {mode === "one-click" && (
        <OneClickOutreach cardStorageKey="agent-1-one-click-outreach" />
      )}
      {mode === "bulk" && (
        <div className="space-y-6">
          <BulkSearchProgress />
          <QuickSearch cardStorageKey="agent-1-search-volume" />
        </div>
      )}
    </div>
  );
}
