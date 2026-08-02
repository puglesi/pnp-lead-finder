"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageSquare, Users, UsersRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildReuseCampaignUrl } from "@/lib/campaign-reuse";
import { getCampaignEffectiveStatus } from "@/lib/campaign-completion";
import { CampaignStatusBadge } from "./campaign-status-badge";
import {
  getCampaignDeliverySnapshot,
  getClickRate,
  getResponseRate,
  getSendProgress,
} from "@/lib/campaign-metrics";
import { formatDistanceToNow } from "@/lib/date-utils";
import type { Campaign } from "@/types/campaign";

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const delivery = getCampaignDeliverySnapshot(campaign);
  const progress = getSendProgress(campaign);
  const responseRate = getResponseRate(campaign);
  const clickRate = getClickRate(campaign);

  return (
    <Card className="border-border/60 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold">{campaign.name}</h3>
              <CampaignStatusBadge
                status={getCampaignEffectiveStatus(campaign)}
              />
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {campaign.subject}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Reutilizar para nova lista"
              onClick={() => router.push(buildReuseCampaignUrl(campaign.id))}
            >
              <UsersRound className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/campanhas/${campaign.id}`}>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5 text-blue-400" />
            {campaign.leadIds.length} leads
          </span>
          {delivery.sentCount > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-violet-400" />
                {clickRate}% cliques
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-amber-400" />
                {responseRate}% resposta
              </span>
            </>
          )}
          <span className="text-xs">
            {formatDistanceToNow(campaign.updatedAt)}
          </span>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}