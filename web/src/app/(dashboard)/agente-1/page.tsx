import { Suspense } from "react";
import { Pickaxe } from "lucide-react";
import { AgentOneSearchModes } from "@/components/agents/agent-one-search-modes";

export default function AgentOnePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Pickaxe className="size-7 text-primary" />
          Agente 1 — Garimpeiro
        </h2>
        <p className="text-muted-foreground">
          Toda busca e prospecção centralizada: Garimpeiro, One-Click e Busca
          em Massa.
        </p>
      </div>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Carregando modos…</p>
        }
      >
        <AgentOneSearchModes />
      </Suspense>
    </div>
  );
}
