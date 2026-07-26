import { promises as fs } from "fs";
import path from "path";
import type { CampaignTrackingEvent } from "@/types/campaign-tracking";

const UPSTASH_KEY = "pnp:campaign-tracking";

interface TrackingStore {
  events: CampaignTrackingEvent[];
}

let memoryCache: TrackingStore | null = null;

function getGlobalStore(): TrackingStore {
  const g = globalThis as typeof globalThis & {
    __pnpTrackingStore?: TrackingStore;
  };
  if (!g.__pnpTrackingStore) {
    g.__pnpTrackingStore = { events: [] };
  }
  return g.__pnpTrackingStore;
}

function hasUpstashConfig(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim()
  );
}

function getFilePath(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "campaign-tracking.json");
  }
  return path.join(process.cwd(), ".data", "campaign-tracking.json");
}

async function loadFromUpstash(): Promise<TrackingStore | null> {
  const base = process.env.KV_REST_API_URL?.replace(/\/$/, "");
  const token = process.env.KV_REST_API_TOKEN?.trim();
  if (!base || !token) return null;

  try {
    const res = await fetch(`${base}/get/${UPSTASH_KEY}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data.result) return { events: [] };
    return JSON.parse(data.result) as TrackingStore;
  } catch {
    return null;
  }
}

async function saveToUpstash(store: TrackingStore): Promise<boolean> {
  const base = process.env.KV_REST_API_URL?.replace(/\/$/, "");
  const token = process.env.KV_REST_API_TOKEN?.trim();
  if (!base || !token) return false;

  try {
    const encoded = encodeURIComponent(JSON.stringify(store));
    const res = await fetch(`${base}/set/${UPSTASH_KEY}/${encoded}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function loadFromFile(): Promise<TrackingStore | null> {
  const file = getFilePath();
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as TrackingStore;
  } catch {
    return null;
  }
}

async function saveToFile(store: TrackingStore): Promise<boolean> {
  const file = getFilePath();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(store, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

async function ensureStore(): Promise<TrackingStore> {
  if (memoryCache) return memoryCache;

  if (hasUpstashConfig()) {
    const remote = await loadFromUpstash();
    memoryCache = remote ?? { events: [] };
    return memoryCache;
  }

  const fromFile = await loadFromFile();
  if (fromFile) {
    memoryCache = fromFile;
    return memoryCache;
  }

  memoryCache = getGlobalStore();
  return memoryCache;
}

async function persist(store: TrackingStore) {
  memoryCache = store;

  if (hasUpstashConfig()) {
    await saveToUpstash(store);
    return;
  }

  const saved = await saveToFile(store);
  if (!saved) {
    getGlobalStore().events = store.events;
  }
}

function newEventId() {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function listTrackingEvents(campaignId?: string) {
  const store = await ensureStore();
  if (!campaignId) return store.events;
  return store.events.filter((e) => e.campaignId === campaignId);
}

export async function recordTrackingEvent(
  input: Omit<CampaignTrackingEvent, "id" | "occurredAt"> & {
    occurredAt?: string;
  }
): Promise<CampaignTrackingEvent> {
  const store = await ensureStore();

  if (input.type === "open") {
    const dup = store.events.find(
      (e) =>
        e.campaignId === input.campaignId &&
        e.leadId === input.leadId &&
        e.type === "open"
    );
    if (dup) return dup;
  }

  const event: CampaignTrackingEvent = {
    id: newEventId(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ...input,
  };

  store.events.push(event);
  await persist(store);
  return event;
}