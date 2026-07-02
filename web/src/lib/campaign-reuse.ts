export function buildReuseCampaignUrl(campaignId: string): string {
  return `/campanhas/nova?from=${encodeURIComponent(campaignId)}`;
}

export function buildReuseCampaignName(sourceName: string): string {
  const base = sourceName
    .replace(/ \(Nova lista(?: \d+)?\)$/i, "")
    .replace(/ \(Cópia(?: \d+)?\)$/i, "")
    .trim();
  return `${base} (Nova lista)`;
}