"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const stack = error.stack
      ? error.stack
          .split("\n")
          .slice(0, 12)
          .map((l) => l.trim())
          .join("\n")
      : "";
    console.error(
      "[P&P error boundary]",
      error.name,
      error.message,
      stack ? `\n${stack}` : "",
      error.digest ? `\ndigest=${error.digest}` : ""
    );
  }, [error]);

  const isDev = process.env.NODE_ENV !== "production";
  const stackPreview = isDev
    ? (error.stack ?? "")
        .split("\n")
        .slice(0, 10)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  // Detect store/field hints from common hydration crashes (no secrets).
  const storeHint = (() => {
    const msg = `${error.message}\n${error.stack ?? ""}`;
    if (/recentSearches|fullSearchHistory|sectorHistory|savedLeads/.test(msg)) {
      return "store: pnp-lead-finder (recentSearches/fullSearchHistory/sectorHistory/savedLeads)";
    }
    if (/leadStatuses|leadIds|sendErrors|campaigns/.test(msg)) {
      return "store: pnp-campaigns (campaigns[].leadIds|leadStatuses|sendErrors)";
    }
    if (/entries|blocklist|EMAIL_BLOCK/.test(msg)) {
      return "store: pnp-email-blocklist (entries)";
    }
    if (/autonomousSources/.test(msg)) {
      return "store: pnp-settings (autonomousSources)";
    }
    if (/Object\.values|Object\.keys|Object\.entries/.test(msg)) {
      return "possível Object.values/keys em payload null — ver /diagnostico-storage";
    }
    return null;
  })();

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col justify-center gap-4 p-8">
      <h2 className="text-xl font-semibold text-foreground">
        Esta página não pôde ser carregada
      </h2>
      <p className="text-sm text-muted-foreground">
        Erro de runtime no cliente. Seus dados salvos não foram apagados.
      </p>
      {isDev && (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-mono font-medium text-amber-900 dark:text-amber-100">
            {error.name}: {error.message}
          </p>
          {storeHint && (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              Hint: {storeHint}
            </p>
          )}
          {stackPreview.length > 0 && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-amber-950/90 dark:text-amber-50/90">
              {stackPreview.join("\n")}
            </pre>
          )}
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              digest: {error.digest}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Abra /diagnostico-storage para inspecionar chaves de storage (sem
            conteúdo sensível).
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => reset()}>
          Tentar novamente
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/diagnostico-storage">Diagnóstico de storage</Link>
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href="/">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
