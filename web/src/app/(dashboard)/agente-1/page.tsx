import { Suspense } from "react";
import { Pickaxe } from "lucide-react";
import { AgentOneGarimpeiro } from "@/components/agents/agent-one-garimpeiro";

export default function AgentOnePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Pickaxe className="size-7 text-primary" />
          Agente 1 — Garimpeiro
        </h2>
        <p className="text-muted-foreground">
          Abra um lote da busca ou monte uma fila de setores sequencial.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando lote…</p>}>
        <AgentOneGarimpeiro />
      </Suspense>
    </div>
  );
}
