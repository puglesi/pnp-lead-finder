"use client";

import type { Campaign } from "../types/campaign.ts";

async function expectOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(body?.error ?? fallback);
}

/** SQLite-first repository. Zustand/localStorage are never authoritative here. */
export async function persistCampaignRecord(campaign: Campaign): Promise<void> {
  const response = await fetch("/api/local-data", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity: "campaign", campaign }),
  });
  await expectOk(response, "Falha ao persistir a campanha no SQLite.");
}

export async function deleteCampaignRecord(campaignId: string): Promise<void> {
  const response = await fetch("/api/local-data", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity: "campaign", id: campaignId }),
  });
  await expectOk(response, "Falha ao apagar a campanha do SQLite.");
}
