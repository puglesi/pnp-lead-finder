"use client";

import { Moon, Search, Wifi } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/store/settings-store";
import type { SearchProviderType } from "@/types/search";

const PROVIDERS: {
  value: SearchProviderType;
  label: string;
  icon: typeof Moon;
}[] = [
  { value: "autonomous", label: "Scraping Autônomo", icon: Moon },
  { value: "serpapi", label: "Premium", icon: Wifi },
  { value: "google-custom", label: "Google CSE", icon: Search },
];

export function ProviderSwitcher({ compact }: { compact?: boolean }) {
  const provider = useSettingsStore((s) => s.provider);
  const setProvider = useSettingsStore((s) => s.setProvider);
  const current = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];
  const Icon = current.icon;

  return (
    <Select
      value={provider}
      onValueChange={(v) => setProvider(v as SearchProviderType)}
    >
      <SelectTrigger
        className={
          compact
            ? "h-8 w-[140px] bg-background/50 text-xs"
            : "h-9 w-full bg-background/50 sm:w-[200px]"
        }
      >
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {PROVIDERS.map((p) => {
          const PIcon = p.icon;
          return (
            <SelectItem key={p.value} value={p.value}>
              <span className="flex items-center gap-2">
                <PIcon className="size-3.5" />
                {p.label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}