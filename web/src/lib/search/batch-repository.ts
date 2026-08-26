import type { Lead } from "../../types/lead.ts";
import type {
  PersistedSearchBatch,
  PersistedSearchSector,
  SearchBatchStage,
  SearchBatchStatus,
} from "../../types/search.ts";

export const SEARCH_BATCH_DB_NAME = "pnp-lead-finder-searches";
export const SEARCH_BATCH_DB_VERSION = 1;
export const SEARCH_BATCH_STORE = "search-batches";
export const SEARCH_LEAD_STORE = "search-leads";
export const ACTIVE_SEARCH_BATCH_KEY = "pnp-active-search-batch";

interface PersistedLeadRecord {
  batchId: string;
  leadKey: string;
  sectorIndex: number | null;
  lead: Lead;
  updatedAt: string;
}

export interface SearchBatchRepository {
  createBatch(batch: PersistedSearchBatch): Promise<void>;
  getAllBatches(): Promise<Array<{ batch: PersistedSearchBatch; leads: Lead[] }>>;
  getBatch(batchId: string): Promise<PersistedSearchBatch | null>;
  getLatestRecoverableBatch(): Promise<PersistedSearchBatch | null>;
  getLeads(batchId: string): Promise<Lead[]>;
  markSectorRunning(batchId: string, sectorIndex: number): Promise<PersistedSearchBatch>;
  saveSectorResult(input: {
    batchId: string;
    sectorIndex: number;
    leads: Lead[];
    error?: string;
  }): Promise<PersistedSearchBatch>;
  upsertLeads(batchId: string, leads: Lead[]): Promise<PersistedSearchBatch>;
  setStage(batchId: string, stage: SearchBatchStage): Promise<PersistedSearchBatch>;
  finishBatch(batchId: string, historyRecordId: string): Promise<PersistedSearchBatch>;
  failBatch(batchId: string, error: string): Promise<PersistedSearchBatch>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openSearchDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponível neste navegador"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SEARCH_BATCH_DB_NAME, SEARCH_BATCH_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SEARCH_BATCH_STORE)) {
        const batches = db.createObjectStore(SEARCH_BATCH_STORE, { keyPath: "batchId" });
        batches.createIndex("updatedAt", "updatedAt");
        batches.createIndex("status", "status");
      }
      if (!db.objectStoreNames.contains(SEARCH_LEAD_STORE)) {
        const leads = db.createObjectStore(SEARCH_LEAD_STORE, {
          keyPath: ["batchId", "leadKey"],
        });
        leads.createIndex("batchId", "batchId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB"));
  });
}

function leadKey(lead: Lead): string {
  const id = lead.id?.trim();
  if (id) return id;
  return `${lead.company.trim().toLowerCase()}|${lead.website.trim().toLowerCase()}`;
}

function dedupeLeads(leads: Lead[]): Lead[] {
  const byFingerprint = new Map<string, Lead>();
  for (const lead of leads) {
    const fingerprint = `${lead.company.trim().toLowerCase()}|${lead.website.trim().toLowerCase()}`;
    if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, lead);
  }
  return [...byFingerprint.values()];
}

function isValidationFinished(lead: Lead): boolean {
  return Boolean(lead.emailValidatedAt) || !lead.email;
}

function recalculateBatch(
  batch: PersistedSearchBatch,
  leads: Lead[],
  now: string,
  status?: SearchBatchStatus
): PersistedSearchBatch {
  const unique = dedupeLeads(leads);
  const completedSectors = batch.sectors.filter((sector) => sector.status === "completed").length;
  const failedSectors = batch.sectors.filter((sector) => sector.status === "failed").length;
  const pendingSectors = batch.sectors.length - completedSectors - failedSectors;
  return {
    ...batch,
    status: status ?? batch.status,
    updatedAt: now,
    lastActivityAt: now,
    lastSavedAt: now,
    leadsFound: leads.length,
    deduplicatedLeads: unique.length,
    completedSectors,
    failedSectors,
    pendingSectors,
    enrichmentCompleted: unique.filter((lead) =>
      lead.enrichmentStatus === "completed" || lead.enrichmentStatus === "skipped"
    ).length,
    enrichmentFailed: unique.filter((lead) => lead.enrichmentStatus === "failed").length,
    validationCompleted: unique.filter(isValidationFinished).length,
    validationFailed: unique.filter((lead) =>
      lead.emailValidationReason === "validation_error" || lead.emailValidationReason === "dns_error"
    ).length,
    scoringCompleted: unique.filter((lead) =>
      lead.scoringStatus === "completed" || Number.isFinite(lead.aiScore)
    ).length,
    scoringFailed: unique.filter((lead) => lead.scoringStatus === "failed").length,
  };
}

export function getResumableSectors(batch: PersistedSearchBatch): PersistedSearchSector[] {
  return batch.sectors.filter(
    (sector) => sector.status === "pending" || sector.status === "running"
  );
}

export function normalizeInterruptedSearchBatch(
  batch: PersistedSearchBatch
): PersistedSearchBatch {
  if (batch.status !== "running" && !batch.sectors.some((sector) => sector.status === "running")) {
    return batch;
  }
  return {
    ...batch,
    status: "interrupted",
    sectors: batch.sectors.map((sector) =>
      sector.status === "running" ? { ...sector, status: "pending" } : sector
    ),
  };
}

async function readBatchLeadsFromStore(store: IDBObjectStore, batchId: string): Promise<Lead[]> {
  const index = store.index("batchId");
  const records = await requestResult(index.getAll(IDBKeyRange.only(batchId))) as PersistedLeadRecord[];
  return dedupeLeads(records.map((record) => record.lead));
}

export function createIndexedDbSearchBatchRepository(): SearchBatchRepository {
  async function withDatabase<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await openSearchDatabase();
    try {
      return await operation(db);
    } finally {
      db.close();
    }
  }

  async function mutateBatch(
    batchId: string,
    mutate: (batch: PersistedSearchBatch, now: string) => PersistedSearchBatch
  ): Promise<PersistedSearchBatch> {
    return withDatabase(async (db) => {
      const transaction = db.transaction(SEARCH_BATCH_STORE, "readwrite");
      const store = transaction.objectStore(SEARCH_BATCH_STORE);
      const batch = await requestResult(store.get(batchId)) as PersistedSearchBatch | undefined;
      if (!batch) throw new Error(`Checkpoint ${batchId} não encontrado`);
      const next = mutate(batch, new Date().toISOString());
      store.put(next);
      await transactionDone(transaction);
      return next;
    });
  }

  return {
    createBatch: (batch) => withDatabase(async (db) => {
      const transaction = db.transaction(SEARCH_BATCH_STORE, "readwrite");
      transaction.objectStore(SEARCH_BATCH_STORE).put(batch);
      await transactionDone(transaction);
    }),

    getAllBatches: () => withDatabase(async (db) => {
      const batches = await requestResult(
        db.transaction(SEARCH_BATCH_STORE).objectStore(SEARCH_BATCH_STORE).getAll()
      ) as PersistedSearchBatch[];
      return Promise.all(
        batches.map(async (batch) => ({
          batch,
          leads: await readBatchLeadsFromStore(
            db.transaction(SEARCH_LEAD_STORE).objectStore(SEARCH_LEAD_STORE),
            batch.batchId
          ),
        }))
      );
    }),

    getBatch: (batchId) => withDatabase(async (db) => {
      const value = await requestResult(
        db.transaction(SEARCH_BATCH_STORE).objectStore(SEARCH_BATCH_STORE).get(batchId)
      ) as PersistedSearchBatch | undefined;
      return value ?? null;
    }),

    getLatestRecoverableBatch: () => withDatabase(async (db) => {
      const batches = await requestResult(
        db.transaction(SEARCH_BATCH_STORE).objectStore(SEARCH_BATCH_STORE).getAll()
      ) as PersistedSearchBatch[];
      const candidate = batches
        .filter((batch) => batch.status === "running" || batch.status === "interrupted" || batch.pendingSectors > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
      return candidate ? normalizeInterruptedSearchBatch(candidate) : null;
    }),

    getLeads: (batchId) => withDatabase(async (db) =>
      readBatchLeadsFromStore(db.transaction(SEARCH_LEAD_STORE).objectStore(SEARCH_LEAD_STORE), batchId)
    ),

    markSectorRunning: (batchId, sectorIndex) => mutateBatch(batchId, (batch, now) => ({
      ...batch,
      status: "running",
      updatedAt: now,
      lastActivityAt: now,
      sectors: batch.sectors.map((sector) =>
        sector.index === sectorIndex
          ? { ...sector, status: "running", startedAt: sector.startedAt ?? now, updatedAt: now, error: undefined }
          : sector
      ),
    })),

    saveSectorResult: (input) => withDatabase(async (db) => {
      const transaction = db.transaction([SEARCH_BATCH_STORE, SEARCH_LEAD_STORE], "readwrite");
      const batchStore = transaction.objectStore(SEARCH_BATCH_STORE);
      const leadStore = transaction.objectStore(SEARCH_LEAD_STORE);
      const batch = await requestResult(batchStore.get(input.batchId)) as PersistedSearchBatch | undefined;
      if (!batch) throw new Error(`Checkpoint ${input.batchId} não encontrado`);
      const now = new Date().toISOString();
      for (const lead of input.leads) {
        const normalized: Lead = {
          ...lead,
          batchId: input.batchId,
          enrichmentStatus: lead.enrichmentStatus ?? "completed",
          scoringStatus: Number.isFinite(lead.aiScore) ? "completed" : "failed",
          lastProcessedAt: now,
        };
        leadStore.put({ batchId: input.batchId, leadKey: leadKey(normalized), sectorIndex: input.sectorIndex, lead: normalized, updatedAt: now } satisfies PersistedLeadRecord);
      }
      const existingLeads = await readBatchLeadsFromStore(leadStore, input.batchId);
      const sectors = batch.sectors.map((sector): PersistedSearchSector =>
        sector.index === input.sectorIndex
          ? {
              ...sector,
              status: input.error ? "failed" : "completed",
              leadsFound: input.leads.length,
              completedAt: now,
              updatedAt: now,
              error: input.error,
            }
          : sector
      );
      const next = recalculateBatch({ ...batch, sectors }, existingLeads, now);
      batchStore.put(next);
      await transactionDone(transaction);
      return next;
    }),

    upsertLeads: (batchId, leads) => withDatabase(async (db) => {
      const transaction = db.transaction([SEARCH_BATCH_STORE, SEARCH_LEAD_STORE], "readwrite");
      const batchStore = transaction.objectStore(SEARCH_BATCH_STORE);
      const leadStore = transaction.objectStore(SEARCH_LEAD_STORE);
      const batch = await requestResult(batchStore.get(batchId)) as PersistedSearchBatch | undefined;
      if (!batch) throw new Error(`Checkpoint ${batchId} não encontrado`);
      const now = new Date().toISOString();
      for (const lead of leads) {
        leadStore.put({ batchId, leadKey: leadKey(lead), sectorIndex: null, lead: { ...lead, batchId, lastProcessedAt: now }, updatedAt: now } satisfies PersistedLeadRecord);
      }
      const allLeads = await readBatchLeadsFromStore(leadStore, batchId);
      const next = recalculateBatch(batch, allLeads, now);
      batchStore.put(next);
      await transactionDone(transaction);
      return next;
    }),

    setStage: (batchId, stage) => mutateBatch(batchId, (batch, now) => ({
      ...batch,
      currentStage: stage,
      updatedAt: now,
      lastActivityAt: now,
      lastSavedAt: now,
    })),

    finishBatch: (batchId, historyRecordId) => mutateBatch(batchId, (batch, now) => ({
      ...batch,
      status: batch.failedSectors > 0 ? "completed_with_errors" : "completed",
      currentStage: "completed",
      historyRecordId,
      pendingSectors: 0,
      updatedAt: now,
      lastActivityAt: now,
      lastSavedAt: now,
    })),

    failBatch: (batchId, error) => mutateBatch(batchId, (batch, now) => ({
      ...batch,
      status: "interrupted",
      error,
      updatedAt: now,
      lastActivityAt: now,
      lastSavedAt: now,
      sectors: batch.sectors.map((sector) =>
        sector.status === "running" ? { ...sector, status: "pending", updatedAt: now } : sector
      ),
    })),
  };
}

/** Deterministic adapter for regression tests; production always uses IndexedDB. */
export function createMemorySearchBatchRepository(): SearchBatchRepository {
  const batches = new Map<string, PersistedSearchBatch>();
  const leadsByBatch = new Map<string, Map<string, Lead>>();
  const now = () => new Date().toISOString();
  const requireBatch = (batchId: string) => {
    const batch = batches.get(batchId);
    if (!batch) throw new Error(`Checkpoint ${batchId} não encontrado`);
    return batch;
  };
  const saveBatch = (batch: PersistedSearchBatch) => {
    batches.set(batch.batchId, structuredClone(batch));
    return structuredClone(batch);
  };
  const allLeads = (batchId: string) =>
    dedupeLeads([...(leadsByBatch.get(batchId)?.values() ?? [])]).map((lead) => structuredClone(lead));
  const upsert = (batchId: string, leads: Lead[]) => {
    const stored = leadsByBatch.get(batchId) ?? new Map<string, Lead>();
    for (const lead of leads) stored.set(leadKey(lead), structuredClone(lead));
    leadsByBatch.set(batchId, stored);
  };

  return {
    async createBatch(batch) {
      saveBatch(batch);
      leadsByBatch.set(batch.batchId, new Map());
    },
    async getAllBatches() {
      return [...batches.values()].map((batch) => ({
        batch: structuredClone(batch),
        leads: allLeads(batch.batchId),
      }));
    },
    async getBatch(batchId) {
      const batch = batches.get(batchId);
      return batch ? structuredClone(batch) : null;
    },
    async getLatestRecoverableBatch() {
      const batch = [...batches.values()]
        .filter((item) => item.status === "running" || item.status === "interrupted" || item.pendingSectors > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      return batch ? normalizeInterruptedSearchBatch(structuredClone(batch)) : null;
    },
    async getLeads(batchId) {
      return allLeads(batchId);
    },
    async markSectorRunning(batchId, sectorIndex) {
      const batch = requireBatch(batchId);
      const timestamp = now();
      return saveBatch({
        ...batch,
        status: "running",
        updatedAt: timestamp,
        lastActivityAt: timestamp,
        sectors: batch.sectors.map((sector) =>
          sector.index === sectorIndex
            ? { ...sector, status: "running", startedAt: sector.startedAt ?? timestamp, updatedAt: timestamp }
            : sector
        ),
      });
    },
    async saveSectorResult({ batchId, sectorIndex, leads, error }) {
      const batch = requireBatch(batchId);
      const timestamp = now();
      upsert(
        batchId,
        leads.map((lead) => ({
          ...lead,
          batchId,
          enrichmentStatus: lead.enrichmentStatus ?? "completed",
          scoringStatus: Number.isFinite(lead.aiScore) ? "completed" : "failed",
          lastProcessedAt: timestamp,
        }))
      );
      const sectors = batch.sectors.map((sector): PersistedSearchSector =>
        sector.index === sectorIndex
          ? {
              ...sector,
              status: error ? "failed" : "completed",
              leadsFound: leads.length,
              completedAt: timestamp,
              updatedAt: timestamp,
              error,
            }
          : sector
      );
      return saveBatch(recalculateBatch({ ...batch, sectors }, allLeads(batchId), timestamp));
    },
    async upsertLeads(batchId, leads) {
      const batch = requireBatch(batchId);
      upsert(batchId, leads);
      return saveBatch(recalculateBatch(batch, allLeads(batchId), now()));
    },
    async setStage(batchId, stage) {
      const batch = requireBatch(batchId);
      const timestamp = now();
      return saveBatch({ ...batch, currentStage: stage, updatedAt: timestamp, lastActivityAt: timestamp, lastSavedAt: timestamp });
    },
    async finishBatch(batchId, historyRecordId) {
      const batch = requireBatch(batchId);
      const timestamp = now();
      return saveBatch({
        ...batch,
        status: batch.failedSectors > 0 ? "completed_with_errors" : "completed",
        currentStage: "completed",
        historyRecordId,
        pendingSectors: 0,
        updatedAt: timestamp,
        lastActivityAt: timestamp,
        lastSavedAt: timestamp,
      });
    },
    async failBatch(batchId, error) {
      const batch = requireBatch(batchId);
      const timestamp = now();
      return saveBatch({
        ...normalizeInterruptedSearchBatch(batch),
        status: "interrupted",
        error,
        updatedAt: timestamp,
        lastActivityAt: timestamp,
        lastSavedAt: timestamp,
      });
    },
  };
}

async function fetchLocalBatch(
  search: string
): Promise<{ batch: PersistedSearchBatch; leads: Lead[] } | null> {
  const response = await fetch("/api/local-data/search-batches?" + search, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = await response.json() as {
    data?: { batch: PersistedSearchBatch; leads: Lead[] } | null;
  };
  return body.data ?? null;
}

async function putLocalBatch(
  batch: PersistedSearchBatch,
  leads: Lead[]
): Promise<void> {
  const response = await fetch("/api/local-data/search-batches", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch, leads }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(
      body?.error ??
        "Banco local indisponível — o checkpoint não está protegido."
    );
  }
}

/**
 * SQLite is authoritative. IndexedDB remains a mirrored recovery cache.
 * Mutations only resolve after the server confirms the SQLite write.
 */
export function createDurableSearchBatchRepository(): SearchBatchRepository {
  const cache = createIndexedDbSearchBatchRepository();

  async function seedCache(
    item: { batch: PersistedSearchBatch; leads: Lead[] }
  ): Promise<void> {
    try {
      const existing = await cache.getBatch(item.batch.batchId);
      if (!existing) await cache.createBatch(item.batch);
      if (item.leads.length) await cache.upsertLeads(item.batch.batchId, item.leads);
    } catch {
      // SQLite read remains authoritative even when browser cache is unavailable.
    }
  }

  async function persistAfter<T extends PersistedSearchBatch>(
    operation: () => Promise<T>
  ): Promise<T> {
    const batch = await operation();
    const leads = await cache.getLeads(batch.batchId);
    await putLocalBatch(batch, leads);
    return batch;
  }

  return {
    async createBatch(batch) {
      await putLocalBatch(batch, []);
      try {
        await cache.createBatch(batch);
      } catch {
        // Durable write already succeeded.
      }
    },
    async getAllBatches() {
      try {
        const response = await fetch("/api/local-data/search-batches", {
          cache: "no-store",
        });
        if (response.ok) {
          const body = await response.json() as {
            data?: Array<{ batch: PersistedSearchBatch; leads: Lead[] }>;
          };
          const data = Array.isArray(body.data) ? body.data : [];
          await Promise.all(data.map(seedCache));
          return data;
        }
      } catch {
        // Explicit read-only cache fallback.
      }
      return cache.getAllBatches();
    },
    async getBatch(batchId) {
      try {
        const item = await fetchLocalBatch(
          "batchId=" + encodeURIComponent(batchId)
        );
        if (item) {
          await seedCache(item);
          return item.batch;
        }
      } catch {
        // Explicit read-only cache fallback.
      }
      return cache.getBatch(batchId);
    },
    async getLatestRecoverableBatch() {
      try {
        const item = await fetchLocalBatch("latest=1");
        if (item) {
          await seedCache(item);
          return normalizeInterruptedSearchBatch(item.batch);
        }
      } catch {
        // Explicit read-only cache fallback.
      }
      return cache.getLatestRecoverableBatch();
    },
    async getLeads(batchId) {
      try {
        const item = await fetchLocalBatch(
          "batchId=" + encodeURIComponent(batchId)
        );
        if (item) {
          await seedCache(item);
          return item.leads;
        }
      } catch {
        // Explicit read-only cache fallback.
      }
      return cache.getLeads(batchId);
    },
    markSectorRunning: (batchId, sectorIndex) =>
      persistAfter(() => cache.markSectorRunning(batchId, sectorIndex)),
    saveSectorResult: (input) =>
      persistAfter(() => cache.saveSectorResult(input)),
    upsertLeads: (batchId, leads) =>
      persistAfter(() => cache.upsertLeads(batchId, leads)),
    setStage: (batchId, stage) =>
      persistAfter(() => cache.setStage(batchId, stage)),
    finishBatch: (batchId, historyRecordId) =>
      persistAfter(() => cache.finishBatch(batchId, historyRecordId)),
    failBatch: (batchId, error) =>
      persistAfter(() => cache.failBatch(batchId, error)),
  };
}

export function createInitialPersistedSearchBatch(input: {
  batchId: string;
  sectorsInput: string;
  sectors: string[];
  location: string;
  configuredQuantity: number;
  provider: PersistedSearchBatch["provider"];
  searchProfile: PersistedSearchBatch["searchProfile"];
  workers: number;
  now?: string;
}): PersistedSearchBatch {
  const now = input.now ?? new Date().toISOString();
  return {
    batchId: input.batchId,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    lastSavedAt: now,
    status: "running",
    currentStage: "search",
    sectorsInput: input.sectorsInput,
    sectors: input.sectors.map((sector, index) => ({
      index,
      sector,
      status: "pending",
      leadsFound: 0,
      updatedAt: now,
    })),
    location: input.location,
    configuredQuantity: input.configuredQuantity,
    provider: input.provider,
    searchProfile: input.searchProfile,
    workers: input.workers,
    leadsFound: 0,
    deduplicatedLeads: 0,
    completedSectors: 0,
    pendingSectors: input.sectors.length,
    failedSectors: 0,
    enrichmentCompleted: 0,
    enrichmentFailed: 0,
    validationCompleted: 0,
    validationFailed: 0,
    scoringCompleted: 0,
    scoringFailed: 0,
  };
}

export function setActiveSearchBatchId(batchId: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (batchId) localStorage.setItem(ACTIVE_SEARCH_BATCH_KEY, batchId);
  else localStorage.removeItem(ACTIVE_SEARCH_BATCH_KEY);
}

export function getActiveSearchBatchId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACTIVE_SEARCH_BATCH_KEY);
}
