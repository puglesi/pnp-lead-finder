"use client";

import { useSearchParams } from "next/navigation";
import { CreateCampaignForm } from "@/components/campaigns/create-campaign-form";

export function NovaCampanhaContent() {
  const searchParams = useSearchParams();
  const reuseFromId = searchParams.get("from");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          {reuseFromId ? "Reutilizar Campanha" : "Nova Campanha"}
        </h2>
        <p className="text-muted-foreground">
          {reuseFromId
            ? "Template e configurações carregados — selecione a nova lista de leads"
            : "Importe leads externos, edite o email em tela ampla e envie com anexo PDF"}
        </p>
      </div>
      <CreateCampaignForm reuseFromId={reuseFromId} />
    </div>
  );
}