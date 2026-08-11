import { Send } from "lucide-react";
import { AgentThreeSender } from "@/components/agents/agent-three-sender";
import { AgentThreeImportList } from "@/components/agents/agent-three-import-list";

export default function AgentThreePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Send className="size-7 text-primary" />
          Agente 3 — Enviador
        </h2>
        <p className="text-muted-foreground">
          Execute filas independentes por operação com proteção server-side.
        </p>
      </div>
      <AgentThreeImportList />
      <AgentThreeSender />
    </div>
  );
}
