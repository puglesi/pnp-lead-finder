import { ShieldCheck } from "lucide-react";
import { AgentTwoValidator } from "@/components/agents/agent-two-validator";

export default function AgentTwoPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldCheck className="size-7 text-primary" />
          Agente 2 — Validador
        </h2>
        <p className="text-muted-foreground">
          Valide sintaxe, domínio e registros MX dos e-mails salvos, sem presumir a existência da caixa postal.
        </p>
      </div>
      <AgentTwoValidator />
    </div>
  );
}
