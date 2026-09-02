"use client";

import type { EmailBlocklistEntry } from "./email-blocklist.ts";

async function expectOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(body?.error ?? fallback);
}

/** Durable suppression repository; browser state is only a UI cache. */
export async function persistBlocklistEntries(
  entries: readonly EmailBlocklistEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  const response = await fetch("/api/local-data", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity: "blocklist", entries }),
  });
  await expectOk(response, "Falha ao persistir a blocklist no SQLite.");
}

export async function deleteBlocklistEntry(entryId: string): Promise<void> {
  const response = await fetch("/api/local-data", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity: "blocklist", id: entryId }),
  });
  await expectOk(response, "Falha ao remover a entrada da blocklist no SQLite.");
}
