export const CAMPAIGN_PROFILE_IDS = [
  "panek-puglesi",
  "modeclean",
] as const;

export type CampaignProfileId = (typeof CAMPAIGN_PROFILE_IDS)[number];

export interface CampaignProfileDefinition {
  id: CampaignProfileId;
  name: string;
}

export const CAMPAIGN_PROFILES: readonly CampaignProfileDefinition[] = [
  { id: "panek-puglesi", name: "Panek & Puglesi" },
  { id: "modeclean", name: "Modeclean" },
];

export function isCampaignProfileId(
  value: unknown
): value is CampaignProfileId {
  return (
    typeof value === "string" &&
    CAMPAIGN_PROFILE_IDS.some((profileId) => profileId === value)
  );
}

export function getCampaignProfileName(profileId: CampaignProfileId): string {
  return (
    CAMPAIGN_PROFILES.find((profile) => profile.id === profileId)?.name ??
    profileId
  );
}
