"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type ThemePreference,
  useThemeStore,
} from "@/store/theme-store";

const OPTIONS: {
  id: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-border/70 bg-background/60 p-0.5",
        compact && "scale-95"
      )}
      role="group"
      aria-label="Tema da interface"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = preference === option.id;
        return (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 gap-1.5 px-2.5 text-xs",
              active
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={active}
            onClick={() => setPreference(option.id)}
            title={option.label}
          >
            <Icon className="size-3.5" />
            <span className={cn(compact && "sr-only sm:not-sr-only")}>
              {option.label}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
