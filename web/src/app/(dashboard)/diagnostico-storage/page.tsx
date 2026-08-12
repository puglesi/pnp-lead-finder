"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  inspectPersistKeys,
  PERSIST_STORAGE_KEYS,
} from "@/lib/store-rehydrate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

export default function DiagnosticoStoragePage() {
  const hydrated = useSyncExternalStore(subscribe, client, server);

  const report = useMemo(() => {
    if (!hydrated || typeof window === "undefined") return [];
    return inspectPersistKeys(window.localStorage, [...PERSIST_STORAGE_KEYS]);
  }, [hydrated]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Diagnóstico de storage
        </h2>
        <p className="text-sm text-muted-foreground">
          Somente nomes de chaves, tipos e campos null/ausentes. Nenhum e-mail,
          lead, token ou conteúdo sensível é exibido.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Chave</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Versão</th>
              <th className="px-4 py-2">Null fields</th>
            </tr>
          </thead>
          <tbody>
            {report.map((row) => (
              <tr key={row.key} className="border-t border-border/50">
                <td className="px-4 py-2 font-mono text-xs">{row.key}</td>
                <td className="px-4 py-2">
                  {!row.present ? (
                    <Badge variant="secondary">ausente</Badge>
                  ) : !row.parseOk ? (
                    <Badge variant="danger">JSON inválido</Badge>
                  ) : (
                    <Badge variant="outline">{row.valueType}</Badge>
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {row.version ?? "—"}
                </td>
                <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">
                  {row.nullFields.length > 0
                    ? row.nullFields.join(", ")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button asChild variant="outline">
        <Link href="/">Voltar ao Dashboard</Link>
      </Button>
    </div>
  );
}
