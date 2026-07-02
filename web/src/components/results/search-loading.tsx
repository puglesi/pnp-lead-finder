"use client";

import { Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkSearchProgress } from "@/components/dashboard/bulk-search-progress";
import { useLeadStore } from "@/store/lead-store";

export function SearchLoading() {
  const { currentKeyword, currentLocation } = useLeadStore();

  return (
    <div className="space-y-6">
      <BulkSearchProgress />

      <Card className="border-border/60 bg-gradient-to-br from-card to-blue-500/5">
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Search className="size-6 animate-pulse text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              Processando{" "}
              <span className="text-primary">{currentKeyword || "setores"}</span>
              {currentLocation && (
                <span className="text-muted-foreground">
                  {" "}
                  em {currentLocation}
                </span>
              )}
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Extraindo, validando emails e calculando scores IA...
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 overflow-hidden">
        <CardContent className="p-0">
          <div className="border-b border-border bg-muted/20 px-5 py-3">
            <Skeleton className="h-4 w-48" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border/40 px-5 py-4"
            >
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="hidden h-4 w-40 lg:block" />
              <Skeleton className="ml-auto h-6 w-12 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}