/**
 * Single source of truth for campaign recipient eligibility summaries.
 * Cards, preview panel, Agent 3, and Enviar agora must all use this shape.
 */
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import type { Lead } from "../types/lead.ts";
import type { Campaign } from "../types/campaign.ts";
import type { EmailContactKind } from "./global-email-deduplication.ts";
import {
  auditGlobalEmailRecipients,
  buildGlobalEmailHistory,
  buildGlobalEmailHistoryFromSendHistory,
  buildPermanentContactBlocks,
  mergeGlobalEmailHistory,
  type ConfirmedSendHistoryEvidence,
  type GlobalDeduplicationPreview,
  type GlobalEmailHistoryRecord,
  type PermanentContactBlock,
} from "./global-email-deduplication.ts";
import type { AgentThreeOperationState } from "./agent-three-queue.ts";
import {
  emailBlocklistToPermanentBlocks,
  type EmailBlocklistEntry,
} from "./email-blocklist.ts";
import { hasValidEmail } from "./email-templates.ts";
import { normalizeEmail } from "./email-validation.ts";

export interface CampaignEligibilitySummary {
  operation: CampaignProfileId;
  contactKind: EmailContactKind;
  /** Members considered (selected / batch / import). */
  totalMembers: number;
  withEmail: number;
  withoutEmail: number;
  invalidEmail: number;
  duplicatesInBatch: number;
  blocked: number;
  qualityExcluded: number;
  alreadyContactedSameOperation: number;
  otherOperationWarnings: number;
  newRecipients: number;
  authorizedFollowUps: number;
  /** Canonical eligible = finalSendCount from audit. */
  eligibleFinal: number;
  excludedFinal: number;
  preview: GlobalDeduplicationPreview;
  eligibleLeadIds: string[];
}

export function buildCampaignEligibilitySummary(input: {
  operation: CampaignProfileId;
  campaignId: string;
  contactKind?: EmailContactKind;
  members: readonly Lead[];
  allKnownLeads?: readonly Lead[];
  campaigns?: readonly Campaign[];
  operations?: Record<CampaignProfileId, AgentThreeOperationState>;
  blockedEntries?: readonly EmailBlocklistEntry[] | null;
  history?: readonly GlobalEmailHistoryRecord[];
  officialSendHistory?: readonly ConfirmedSendHistoryEvidence[];
  permanentBlocks?: readonly PermanentContactBlock[];
}): CampaignEligibilitySummary {
  const contactKind = input.contactKind ?? "first_contact";
  const members = Array.isArray(input.members) ? input.members : [];
  const totalMembers = members.length;

  let withoutEmail = 0;
  let withEmail = 0;
  for (const lead of members) {
    if (hasValidEmail(lead.email) || normalizeEmail(lead.normalizedEmail)) {
      withEmail += 1;
    } else {
      withoutEmail += 1;
    }
  }

  const known = input.allKnownLeads ?? members;
  const campaigns = input.campaigns ?? [];
  const operations = input.operations ?? ({} as Record<
    CampaignProfileId,
    AgentThreeOperationState
  >);

  const history = mergeGlobalEmailHistory(
    input.history ??
      buildGlobalEmailHistory({
        campaigns: campaigns as Campaign[],
        leads: known as Lead[],
        operations,
      }),
    buildGlobalEmailHistoryFromSendHistory(
      input.officialSendHistory ?? [],
      campaigns as Campaign[]
    )
  );

  const systemBlocks =
    input.permanentBlocks ??
    buildPermanentContactBlocks({
      campaigns: campaigns as Campaign[],
      leads: known as Lead[],
      operations,
    });
  const blocklistBlocks = emailBlocklistToPermanentBlocks(
    input.blockedEntries
  );
  const permanentBlocks = [...systemBlocks, ...blocklistBlocks];

  const recipients = members.map((lead) => ({
    leadId: lead.id,
    company: lead.company,
    email: lead.normalizedEmail ?? lead.email,
    lead,
  }));

  const preview = auditGlobalEmailRecipients({
    operation: input.operation,
    campaignId: input.campaignId,
    contactKind,
    companiesFound: totalMembers,
    recipients,
    history,
    permanentBlocks,
  });

  const eligibleLeadIds = preview.decisions
    .filter((d) => d.included)
    .map((d) => d.leadId);

  return {
    operation: input.operation,
    contactKind,
    totalMembers,
    withEmail,
    withoutEmail,
    invalidEmail: preview.decisions.filter((d) => d.code === "invalid_email")
      .length,
    duplicatesInBatch: preview.duplicatesInBatch,
    blocked: preview.blockedContacts,
    qualityExcluded: preview.qualityExcluded,
    alreadyContactedSameOperation: preview.alreadyContactedSameOperation,
    otherOperationWarnings: preview.otherOperationWarnings,
    newRecipients: preview.newRecipients,
    authorizedFollowUps: preview.authorizedFollowUps,
    eligibleFinal: preview.finalSendCount,
    excludedFinal: Math.max(0, totalMembers - preview.finalSendCount),
    preview,
    eligibleLeadIds,
  };
}

/** Top cards must use the same numbers as the detailed preview. */
export function eligibilityTopCards(summary: CampaignEligibilitySummary): {
  eligible: number;
  excluded: number;
  total: number;
} {
  return {
    eligible: summary.eligibleFinal,
    excluded: summary.excludedFinal,
    total: summary.totalMembers,
  };
}
