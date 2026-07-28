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
          Monte uma fila de setores e processe cada busca sequencialmente.
        </p>
      </div>
      <AgentOneGarimpeiro />
    </div>
  );
}
