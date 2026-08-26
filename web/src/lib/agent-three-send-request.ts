import {
  appendUnsubscribeFooter,
  renderEmailTemplate,
  renderFullCampaignEmail,
  stripHtmlToText,
} from "./email-templates.ts";
import { injectEmailTracking } from "./campaign-tracking.ts";
import type { AgentThreeQueueItem } from "./agent-three-queue.ts";
import type { AgentThreeSendRequest } from "./agent-three-smtp-contract.ts";
import type { Campaign } from "../types/campaign.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import type { CampaignTrackingPayload } from "../types/campaign-tracking.ts";
import type { Lead } from "../types/lead.ts";
import {
  getOperationSignatureMismatch,
  OPERATION_SIGNATURE_MISMATCH_MESSAGE,
} from "./operation-signature.ts";

export const AGENT_THREE_TRACKING_ERROR_MESSAGE =
  "Não foi possível preparar o rastreamento da mensagem.";

export interface AgentThreeSendRequestBuildResult {
  request: AgentThreeSendRequest | null;
  errorMessage: string | null;
}

export interface AgentThreeSendRequestBuilderDependencies {
  injectTracking?: (
    html: string,
    payload: CampaignTrackingPayload
  ) => string;
}

function templateLead(
  item: AgentThreeQueueItem,
  lead: Lead | null
): Lead {
  if (lead) return lead;
  return {
    id: item.leadId,
    company: item.companyName,
    website: "",
    email: item.normalizedEmail,
    phone: "",
    address: item.location,
    category: item.sector,
    aiScore: 0,
  };
}

function attachmentPayload(campaign: Campaign) {
  const attachment = campaign.attachment;
  if (
    !attachment ||
    attachment.mimeType !== "application/pdf" ||
    !attachment.dataUrl.startsWith("data:application/pdf;base64,")
  ) {
    return undefined;
  }
  const contentBase64 = attachment.dataUrl.split(",", 2)[1] ?? "";
  if (!contentBase64) return undefined;
  return {
    filename: attachment.name,
    mimeType: "application/pdf" as const,
    contentBase64,
  };
}

export function buildAgentThreeSendRequest(
  profileId: CampaignProfileId,
  campaign: Campaign,
  item: AgentThreeQueueItem,
  lead: Lead | null,
  dependencies: AgentThreeSendRequestBuilderDependencies = {}
): AgentThreeSendRequestBuildResult {
  if (campaign.campaignProfileId !== profileId) {
    return {
      request: null,
      errorMessage: OPERATION_SIGNATURE_MISMATCH_MESSAGE,
    };
  }
  const signatureMismatch = getOperationSignatureMismatch(
    profileId,
    campaign.signature,
    { requireOperationId: true }
  );
  if (signatureMismatch) {
    return { request: null, errorMessage: signatureMismatch };
  }
  if (!item.normalizedEmail) {
    return {
      request: null,
      errorMessage: "Destinatário inválido.",
    };
  }

  try {
    const recipientLead = templateLead(item, lead);
    const baseHtml = appendUnsubscribeFooter(
      renderFullCampaignEmail(
        campaign.body,
        campaign.signature,
        recipientLead
      ),
      campaign.unsubscribeLink,
      recipientLead
    );
    const injectTracking =
      dependencies.injectTracking ?? injectEmailTracking;
    const html = injectTracking(baseHtml, {
      campaignId: campaign.id,
      leadId: item.leadId,
      email: item.normalizedEmail,
    });
    return {
      request: {
        operation: profileId,
        recipient: item.normalizedEmail,
        subject: renderEmailTemplate(campaign.subject, recipientLead),
        html,
        text: stripHtmlToText(html),
        campaignId: campaign.id,
        leadId: item.leadId,
        queueItemId: item.id,
        attachment: attachmentPayload(campaign),
      },
      errorMessage: null,
    };
  } catch {
    return {
      request: null,
      errorMessage: AGENT_THREE_TRACKING_ERROR_MESSAGE,
    };
  }
}
