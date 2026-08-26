"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRight,
  Copy,
  MessageSquare,
  Save,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { getCampaignEffectiveStatus } from "@/lib/campaign-completion";
import { CampaignStatusBadge } from "./campaign-status-badge";
import {
  countConfirmedSmtpSends,
  getCampaignListProgressPercent,
} from "@/lib/campaign-list-metrics";
import { formatDistanceToNow } from "@/lib/date-utils";
import { buildReuseCampaignUrl } from "@/lib/campaign-reuse";
import type { Campaign } from "@/types/campaign";
import { cn } from "@/lib/utils";
import { useCampaignStore } from "@/store/campaign-store";
import {
  LOCAL_DATA_UNAVAILABLE_MESSAGE,
  isLocalDataUnavailableError,
  prepareLocalDataWrite,
  useLocalDataAvailability,
} from "@/lib/local-data-client";

export function CampaignListTable({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const localDataAvailability = useLocalDataAvailability();
  const localDataWriteBlocked = localDataAvailability === "unavailable";
  const duplicateCampaign = useCampaignStore((s) => s.duplicateCampaign);
  const deleteCampaign = useCampaignStore((s) => s.deleteCampaign);
  const setCampaignStatus = useCampaignStore((s) => s.setCampaignStatus);
  const updateCampaign = useCampaignStore((s) => s.updateCampaign);

  const handleReuse = (campaign: Campaign) => {
    router.push(buildReuseCampaignUrl(campaign.id));
  };

  const handleSave = async (campaign: Campaign) => {
    try {
      const ready = await prepareLocalDataWrite();
      if (!ready) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      const status = getCampaignEffectiveStatus(campaign);
      if (status === "completed" || status === "archived") {
        updateCampaign(campaign.id, {});
        toast.success("Campanha já persistida.");
        return;
      }
      if (status === "draft") {
        setCampaignStatus(campaign.id, "saved");
      } else {
        updateCampaign(campaign.id, {});
      }
      toast.success("Campanha salva.");
    } catch (error) {
      if (isLocalDataUnavailableError(error)) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      throw error;
    }
  };

  const handleDuplicate = async (campaign: Campaign) => {
    try {
      const ready = await prepareLocalDataWrite();
      if (!ready) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      const copy = duplicateCampaign(campaign.id);
      if (!copy) {
        toast.error("Não foi possível duplicar.");
        return;
      }
      toast.success(`Cópia criada: ${copy.name}`);
    } catch (error) {
      if (isLocalDataUnavailableError(error)) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      throw error;
    }
  };

  const handleArchive = async (campaign: Campaign) => {
    try {
      const ready = await prepareLocalDataWrite();
      if (!ready) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      setCampaignStatus(campaign.id, "archived");
      toast.success("Campanha arquivada.");
    } catch (error) {
      if (isLocalDataUnavailableError(error)) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      throw error;
    }
  };

  const handleDelete = async (campaign: Campaign) => {
    if (
      !window.confirm(
        `Apagar permanentemente a campanha “${campaign.name}”? Esta ação não remove o histórico de envios já confirmados em outras estruturas, mas remove a campanha da lista.`
      )
    ) {
      return;
    }
    try {
      const ready = await prepareLocalDataWrite();
      if (!ready) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      deleteCampaign(campaign.id);
      toast.success("Campanha apagada.");
    } catch (error) {
      if (isLocalDataUnavailableError(error)) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      throw error;
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-6 py-12 text-center text-sm text-muted-foreground">
        Nenhuma campanha salva ainda. Crie uma nova — ela permanecerá após reload
        e limpar interface.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Campanha</th>
              <th className="px-5 py-3 font-medium">Leads</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Enviados</th>
              <th className="px-5 py-3 font-medium">Respostas</th>
              <th className="px-5 py-3 font-medium">Progresso</th>
              <th className="px-5 py-3 font-medium">Atualizado</th>
              <th className="px-5 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const confirmedSent = countConfirmedSmtpSends(campaign);
              const progress = getCampaignListProgressPercent(campaign);
              const replied = (campaign.leadStatuses ?? []).filter(
                (status) =>
                  status.status === "replied" &&
                  Boolean(status.providerMessageId) &&
                  !String(status.providerMessageId).startsWith("sim-")
              ).length;
              const responseRate =
                confirmedSent === 0
                  ? 0
                  : Math.round((replied / confirmedSent) * 100);
              const effective = getCampaignEffectiveStatus(campaign);

              return (
                <tr
                  key={campaign.id}
                  className="border-b border-border/40 transition-colors last:border-0 hover:bg-accent/20"
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-foreground">
                      {campaign.name}
                    </p>
                    <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                      {campaign.subject || "(sem assunto)"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Users className="size-3.5 text-blue-400" />
                      {campaign.leadIds.length}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <CampaignStatusBadge status={effective} />
                  </td>
                  <td className="px-5 py-4 tabular-nums">
                    <span className="font-medium text-emerald-400">
                      {confirmedSent}
                    </span>
                    <span className="text-muted-foreground">
                      /{campaign.leadIds.length}
                    </span>
                  </td>
                  <td className="px-5 py-4 tabular-nums">
                    {confirmedSent > 0 ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-medium",
                          responseRate >= 10
                            ? "text-emerald-400"
                            : "text-muted-foreground"
                        )}
                      >
                        <MessageSquare className="size-3.5" />
                        {responseRate}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-[100px] items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {progress}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {formatDistanceToNow(campaign.updatedAt)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => void handleSave(campaign)}
                        disabled={localDataWriteBlocked}
                        title="Salvar"
                      >
                        <Save className="size-3.5" />
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => void handleDuplicate(campaign)}
                        disabled={localDataWriteBlocked}
                        title="Duplicar"
                      >
                        <Copy className="size-3.5" />
                        Duplicar
                      </Button>
                      {effective !== "archived" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => void handleArchive(campaign)}
                          disabled={localDataWriteBlocked}
                          title="Arquivar"
                        >
                          <Archive className="size-3.5" />
                          Arquivar
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs text-red-300"
                        onClick={() => void handleDelete(campaign)}
                        disabled={localDataWriteBlocked}
                        title="Apagar"
                      >
                        <Trash2 className="size-3.5" />
                        Apagar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => handleReuse(campaign)}
                      >
                        <UsersRound className="size-3.5" />
                        Reutilizar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        asChild
                      >
                        <Link href={`/campanhas/${campaign.id}`}>
                          Abrir
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
