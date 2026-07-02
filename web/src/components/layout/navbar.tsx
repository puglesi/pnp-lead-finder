"use client";

import { Bell, User } from "lucide-react";
import { useLeadStore } from "@/store/lead-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SerpApiQuotaBadge } from "@/components/layout/serpapi-quota-badge";

export function Navbar() {
  const { userName } = useLeadStore();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/30 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            P&P Lead Finder
          </span>
        </h1>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          V2 · Volume
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <SerpApiQuotaBadge />

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-emerald-500" />
        </Button>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500">
            <User className="size-4 text-white" />
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium leading-none">{userName}</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}