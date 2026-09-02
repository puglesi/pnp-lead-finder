import type { CampaignSignature } from "../types/campaign.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import { LOCAL_DATA_UNAVAILABLE_MESSAGE } from "./local-data-availability.ts";
import {
  getOperationSignatureUiStatus,
  OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE,
  type OperationSignatureUiStatus,
} from "./operation-signature.ts";
import { PREVIEW_QUEUE_MISMATCH_MESSAGE } from "./eligibility-fingerprint.ts";

export interface AgentThreePreflightInput {
  operation: CampaignProfileId;
  hasHydrated: boolean;
  isHydrating?: boolean;
  officialSignature: CampaignSignature | null | undefined;
  senderFromEmail: string | null | undefined;
  campaign: {
    id: string;
    campaignProfileId: CampaignProfileId;
    subject?: string;
    body?: string;
  } | null;
  dbWritable: boolean;
  readyCount: number;
  confirmedCount: number;
  queueMatchesPreview?: boolean;
}

export interface AgentThreePreflightResult {
  ok: boolean;
  signatureStatus: OperationSignatureUiStatus;
  errorMessage: string | null;
  readyCount: number;
  confirmedCount: number;
}

/**
 * Client preflight for Agent 3. Never sends mail and never calls SerpAPI.
 * Signature hydration must finish before not_configured is reported.
 */
export function evaluateAgentThreePreflight(
  input: AgentThreePreflightInput
): AgentThreePreflightResult {
  const signatureStatus = getOperationSignatureUiStatus({
    operation: input.operation,
    hasHydrated: input.hasHydrated,
    isHydrating: input.isHydrating,
    signature: input.officialSignature,
  });
  const base = {
    signatureStatus,
    readyCount: input.readyCount,
    confirmedCount: input.confirmedCount,
  };

  if (signatureStatus === "checking") {
    return { ...base, ok: false, errorMessage: null };
  }
  if (signatureStatus === "not_configured") {
    return {
      ...base,
      ok: false,
      errorMessage: OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE,
    };
  }
  if (!input.senderFromEmail?.trim()) {
    return {
      ...base,
      ok: false,
      errorMessage: "Remetente da operação não configurado.",
    };
  }
  if (!input.campaign) {
    return {
      ...base,
      ok: false,
      errorMessage: "Selecione uma campanha salva antes de enviar.",
    };
  }
  if (input.campaign.campaignProfileId !== input.operation) {
    return {
      ...base,
      ok: false,
      errorMessage:
        "A campanha não pertence à operação selecionada.",
    };
  }
  if (!input.campaign.subject?.trim() || !input.campaign.body?.trim()) {
    return {
      ...base,
      ok: false,
      errorMessage: "Campanha/modelo indisponível.",
    };
  }
  if (!input.dbWritable) {
    return {
      ...base,
      ok: false,
      errorMessage: LOCAL_DATA_UNAVAILABLE_MESSAGE,
    };
  }
  if (input.queueMatchesPreview === false) {
    return {
      ...base,
      ok: false,
      errorMessage: PREVIEW_QUEUE_MISMATCH_MESSAGE,
    };
  }

  return { ...base, ok: true, errorMessage: null };
}
