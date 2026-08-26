import type { Campaign } from "../types/campaign.ts";
import {
  getConfirmedDeliveryLeadIds,
  isConfirmedCampaignDelivery,
  isNotConfiguredCampaignFailure,
  reconcileCampaignDelivery,
} from "./campaign-delivery-metrics.ts";

export {
  isConfirmedCampaignDelivery as isAgentThreeConfirmedDelivery,
  isNotConfiguredCampaignFailure,
  reconcileCampaignDelivery,
};

/** Reset failures that never hit SMTP so Agent 3 can treat them as ready again. */
export function recoverNotConfiguredCampaignLeadStatuses(
  campaign: Campaign
): {
  leadStatuses: Campaign["leadStatuses"];
  failedCount: number;
  recoveredCount: number;
  sendErrors: Campaign["sendErrors"];
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  demotedUnconfirmedSentCount: number;
  changed: boolean;
} {
  const reconciled = reconcileCampaignDelivery(campaign);
  return {
    leadStatuses: reconciled.leadStatuses,
    failedCount: reconciled.failedCount,
    recoveredCount:
      reconciled.recoveredNotConfiguredCount +
      reconciled.demotedUnconfirmedSentCount,
    sendErrors: reconciled.sendErrors,
    sentCount: reconciled.sentCount,
    openedCount: reconciled.openedCount,
    clickedCount: reconciled.clickedCount,
    repliedCount: reconciled.repliedCount,
    demotedUnconfirmedSentCount: reconciled.demotedUnconfirmedSentCount,
    changed: reconciled.changed,
  };
}

export function getAgentThreeLoadableLeadIds(campaign: Campaign): string[] {
  const deliveredLeadIds = getConfirmedDeliveryLeadIds(campaign);
  return campaign.leadIds.filter((leadId) => !deliveredLeadIds.has(leadId));
}

export function describeAgentThreeEmptyQueue(input: {
  hasCampaign: boolean;
  campaignRecipientCount: number;
  loadableCount: number;
  resolvedLeadCount: number;
  readyCount: number;
  alreadySentCount: number;
  confirmedDeliveryCount: number;
  recoveredNotConfiguredCount: number;
  missingLeadCount: number;
  removedCount: number;
  dnsErrorCount: number;
  dnsMessage?: string | null;
  noEligibleMessage: string;
}): string | null {
  if (input.readyCount > 0) return null;
  if (!input.hasCampaign) {
    return "Selecione uma campanha antes de iniciar.";
  }
  if (input.campaignRecipientCount === 0) {
    return "A campanha não possui destinatários.";
  }
  if (
    input.confirmedDeliveryCount > 0 &&
    input.confirmedDeliveryCount === input.campaignRecipientCount
  ) {
    return "Todos os destinatários já foram enviados com sucesso.";
  }
  if (
    input.alreadySentCount > 0 &&
    input.resolvedLeadCount === 0 &&
    input.loadableCount === 0
  ) {
    return "Todos os destinatários elegíveis já foram enviados nesta operação.";
  }
  if (
    input.missingLeadCount > 0 &&
    input.missingLeadCount === input.loadableCount
  ) {
    return "Nenhum lead da campanha foi encontrado no armazenamento local.";
  }
  if (input.dnsErrorCount > 0) {
    return (
      input.dnsMessage ??
      "Não foi possível concluir a validação DNS."
    );
  }
  if (input.removedCount > 0 && input.resolvedLeadCount > 0) {
    return "Todos os destinatários elegíveis foram removidos por validação.";
  }
  return input.noEligibleMessage;
}

export function describeAgentThreeExclusionReason(
  reason: string | undefined
): string {
  switch (reason) {
    case "duplicate":
      return "duplicado";
    case "no_email":
      return "sem e-mail";
    case "invalid_syntax":
      return "sintaxe inválida";
    case "domain_not_found":
      return "domínio não encontrado";
    case "no_mx_records":
      return "sem registros MX";
    case "suppressed":
      return "suprimido";
    case "invalid_request":
      return "pedido inválido";
    case "already_contacted":
      return "já contatado pela mesma operação";
    case "unsubscribed":
      return "descadastrado";
    case "permanent_bounce":
      return "bounce permanente";
    case "contact_blocked":
      return "contato bloqueado";
    case "send_locked":
      return "envio já reservado por outra execução";
    case "synthetic":
      return "lead sintético/mock bloqueado";
    case "guess_not_verified":
      return "e-mail presumido sem fonte real";
    case "outside_target":
      return "fora da área";
    case "unknown_location":
      return "Revisar localização";
    default:
      return reason ?? "excluído";
  }
}

/**
 * True exclusions only: blocked/skipped in queue + recipients never queued
 * (duplicates on load). Does NOT count ready/pending items already in the queue.
 */
export function countAgentThreeExcludedRecipients(input: {
  campaignRecipientCount: number;
  queueItems: readonly {
    queueStatus: string;
  }[];
  confirmedSentCount: number;
}): number {
  const blockedOrSkipped = input.queueItems.filter(
    (item) =>
      item.queueStatus === "blocked" || item.queueStatus === "skipped"
  ).length;
  const confirmedInQueue = input.queueItems.filter(
    (item) => item.queueStatus === "sent"
  ).length;
  const confirmedOutsideQueue = Math.max(
    0,
    input.confirmedSentCount - confirmedInQueue
  );
  const missingFromQueue = Math.max(
    0,
    input.campaignRecipientCount - input.queueItems.length
  );
  // Recipients missing from the queue that are not already confirmed deliveries.
  const missingExcluded = Math.max(0, missingFromQueue - confirmedOutsideQueue);
  return blockedOrSkipped + missingExcluded;
}
