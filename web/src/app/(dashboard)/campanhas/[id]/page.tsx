"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCampaignStore } from "@/store/campaign-store";
import { CampaignDetail } from "@/components/campaigns/campaign-detail";
import { Button } from "@/components/ui/button";

const VALID_TABS = ["overview", "report", "compose", "leads", "settings"] as const;
type ValidTab = (typeof VALID_TABS)[number];

function parseTab(param: string | null): ValidTab | undefined {
  if (param && VALID_TABS.includes(param as ValidTab)) {
    return param as ValidTab;
  }
  return undefined;
}

function CampanhaDetailContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const initialTab = parseTab(searchParams.get("tab"));
  const campaign = useCampaignStore((s) =>
    s.campaigns.find((c) => c.id === id)
  );

  if (!campaign) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Campanha não encontrada.</p>
        <Button asChild className="mt-4">
          <Link href="/campanhas">Voltar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <CampaignDetail campaignId={id} initialTab={initialTab} />
    </div>
  );
}

export default function CampanhaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-muted-foreground">
          Carregando campanha...
        </div>
      }
    >
      <CampanhaDetailContent id={id} />
    </Suspense>
  );
}