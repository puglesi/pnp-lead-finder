import type { CampaignProfileId } from "../types/campaign-profile.ts";
import { stripHtmlToText } from "./email-templates.ts";
import {
  isSignatureHtmlEmpty,
  sanitizeSignatureHtml,
} from "./signature-html.ts";

export const OFFICIAL_SIGNATURE_DB_NAME =
  "pnp-lead-finder-official-signatures";
export const OFFICIAL_SIGNATURE_DB_VERSION = 1;
export const OFFICIAL_SIGNATURE_STORE = "operation-signatures";
export const OFFICIAL_SIGNATURE_RECORD_VERSION = 1;
export const OFFICIAL_SIGNATURE_BACKUP_VERSION = 1;
export const LEGACY_OPERATION_SIGNATURE_KEY = "pnp-operation-signatures";

export const SIGNATURE_OPERATIONS: readonly CampaignProfileId[] = [
  "panek-puglesi",
  "modeclean",
];

export interface OfficialSignatureRecord {
  operationId: CampaignProfileId;
  enabled: boolean;
  html: string;
  plainText?: string;
  updatedAt: string;
  version: number;
}

export interface OfficialSignatureBackup {
  format: "pnp-official-signatures";
  version: number;
  exportedAt: string;
  signatures: OfficialSignatureRecord[];
}

export interface OfficialSignatureRepository {
  getAll(): Promise<OfficialSignatureRecord[]>;
  get(operationId: CampaignProfileId): Promise<OfficialSignatureRecord | null>;
  put(record: OfficialSignatureRecord): Promise<void>;
  putMany(records: OfficialSignatureRecord[]): Promise<void>;
}

function isOperationId(value: unknown): value is CampaignProfileId {
  return value === "panek-puglesi" || value === "modeclean";
}

export function createOfficialSignatureRecord(input: {
  operationId: CampaignProfileId;
  enabled: boolean;
  html: string;
  updatedAt?: string;
}): OfficialSignatureRecord {
  const html = sanitizeSignatureHtml(input.html);
  if (isSignatureHtmlEmpty(html)) {
    throw new Error("Assinatura não configurada");
  }
  return {
    operationId: input.operationId,
    enabled: input.enabled,
    html,
    plainText: stripHtmlToText(html),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    version: OFFICIAL_SIGNATURE_RECORD_VERSION,
  };
}

export function normalizeOfficialSignatureRecord(
  raw: unknown
): OfficialSignatureRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<OfficialSignatureRecord>;
  if (!isOperationId(value.operationId) || typeof value.html !== "string") {
    return null;
  }
  const html = sanitizeSignatureHtml(value.html);
  if (isSignatureHtmlEmpty(html)) return null;
  return {
    operationId: value.operationId,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    html,
    plainText:
      typeof value.plainText === "string"
        ? value.plainText
        : stripHtmlToText(html),
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt
        ? value.updatedAt
        : new Date(0).toISOString(),
    version:
      typeof value.version === "number" && value.version > 0
        ? value.version
        : OFFICIAL_SIGNATURE_RECORD_VERSION,
  };
}

/** Reads the old Zustand envelope without accepting empty/invalid signatures. */
export function readLegacyOfficialSignatures(
  raw: string | null,
  now = new Date().toISOString()
): OfficialSignatureRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as {
      state?: { signatures?: Record<string, unknown> };
      signatures?: Record<string, unknown>;
    };
    const signatures = parsed.state?.signatures ?? parsed.signatures;
    if (!signatures || typeof signatures !== "object") return [];
    return SIGNATURE_OPERATIONS.flatMap((operationId) => {
      const legacy = signatures[operationId];
      if (!legacy || typeof legacy !== "object") return [];
      const value = legacy as { enabled?: unknown; body?: unknown };
      if (typeof value.body !== "string") return [];
      try {
        return [
          createOfficialSignatureRecord({
            operationId,
            enabled:
              typeof value.enabled === "boolean" ? value.enabled : true,
            html: value.body,
            updatedAt: now,
          }),
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export async function loadOfficialSignatureRecords(
  repository: OfficialSignatureRepository,
  legacyRaw: string | null
): Promise<{
  records: Partial<Record<CampaignProfileId, OfficialSignatureRecord>>;
  migratedOperations: CampaignProfileId[];
}> {
  const records: Partial<
    Record<CampaignProfileId, OfficialSignatureRecord>
  > = {};
  for (const raw of await repository.getAll()) {
    const normalized = normalizeOfficialSignatureRecord(raw);
    if (normalized) records[normalized.operationId] = normalized;
  }

  const migrations = readLegacyOfficialSignatures(legacyRaw).filter(
    (record) => !records[record.operationId]
  );
  if (migrations.length > 0) {
    await repository.putMany(migrations);
    for (const record of migrations) records[record.operationId] = record;
  }

  return {
    records,
    migratedOperations: migrations.map((record) => record.operationId),
  };
}

export function createOfficialSignatureBackup(
  records: readonly OfficialSignatureRecord[],
  now = new Date().toISOString()
): OfficialSignatureBackup {
  return {
    format: "pnp-official-signatures",
    version: OFFICIAL_SIGNATURE_BACKUP_VERSION,
    exportedAt: now,
    signatures: records
      .map(normalizeOfficialSignatureRecord)
      .filter((record): record is OfficialSignatureRecord => Boolean(record)),
  };
}

export function parseOfficialSignatureBackup(
  raw: string
): OfficialSignatureBackup {
  const parsed = JSON.parse(raw) as Partial<OfficialSignatureBackup>;
  if (
    parsed.format !== "pnp-official-signatures" ||
    parsed.version !== OFFICIAL_SIGNATURE_BACKUP_VERSION ||
    !Array.isArray(parsed.signatures)
  ) {
    throw new Error("Backup de assinaturas inválido");
  }
  const signatures = parsed.signatures
    .map(normalizeOfficialSignatureRecord)
    .filter((record): record is OfficialSignatureRecord => Boolean(record));
  if (signatures.length !== parsed.signatures.length) {
    throw new Error("Backup contém assinatura vazia ou inválida");
  }
  const uniqueOperations = new Set(signatures.map((item) => item.operationId));
  if (uniqueOperations.size !== signatures.length) {
    throw new Error("Backup contém operações duplicadas");
  }
  return {
    format: "pnp-official-signatures",
    version: OFFICIAL_SIGNATURE_BACKUP_VERSION,
    exportedAt:
      typeof parsed.exportedAt === "string"
        ? parsed.exportedAt
        : new Date().toISOString(),
    signatures,
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openOfficialSignatureDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB indisponível para salvar assinaturas oficiais")
    );
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      OFFICIAL_SIGNATURE_DB_NAME,
      OFFICIAL_SIGNATURE_DB_VERSION
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFICIAL_SIGNATURE_STORE)) {
        database.createObjectStore(OFFICIAL_SIGNATURE_STORE, {
          keyPath: "operationId",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Falha ao abrir IndexedDB"));
  });
}

export function createIndexedDbOfficialSignatureRepository(): OfficialSignatureRepository {
  async function withDatabase<T>(
    operation: (database: IDBDatabase) => Promise<T>
  ): Promise<T> {
    const database = await openOfficialSignatureDatabase();
    try {
      return await operation(database);
    } finally {
      database.close();
    }
  }

  return {
    getAll: () =>
      withDatabase(async (database) => {
        const transaction = database.transaction(OFFICIAL_SIGNATURE_STORE);
        return (await requestResult(
          transaction.objectStore(OFFICIAL_SIGNATURE_STORE).getAll()
        )) as OfficialSignatureRecord[];
      }),
    get: (operationId) =>
      withDatabase(async (database) => {
        const transaction = database.transaction(OFFICIAL_SIGNATURE_STORE);
        const result = (await requestResult(
          transaction.objectStore(OFFICIAL_SIGNATURE_STORE).get(operationId)
        )) as OfficialSignatureRecord | undefined;
        return normalizeOfficialSignatureRecord(result);
      }),
    put: (record) =>
      withDatabase(async (database) => {
        const transaction = database.transaction(
          OFFICIAL_SIGNATURE_STORE,
          "readwrite"
        );
        transaction.objectStore(OFFICIAL_SIGNATURE_STORE).put(record);
        await transactionDone(transaction);
      }),
    putMany: (records) =>
      withDatabase(async (database) => {
        const transaction = database.transaction(
          OFFICIAL_SIGNATURE_STORE,
          "readwrite"
        );
        const store = transaction.objectStore(OFFICIAL_SIGNATURE_STORE);
        for (const record of records) store.put(record);
        await transactionDone(transaction);
      }),
  };
}

async function requestLocalSignatures(
  operationId?: CampaignProfileId
): Promise<OfficialSignatureRecord[] | OfficialSignatureRecord | null> {
  const query = operationId
    ? "?operation=" + encodeURIComponent(operationId)
    : "";
  const response = await fetch("/api/local-data/signatures" + query, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = await response.json() as {
    data?: OfficialSignatureRecord[] | OfficialSignatureRecord | null;
  };
  return body.data ?? null;
}

async function putLocalSignatures(
  records: readonly OfficialSignatureRecord[]
): Promise<void> {
  const response = await fetch("/api/local-data/signatures", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ??
        "Banco local indisponível — assinatura não foi protegida."
    );
  }
}

/**
 * SQLite is the official signature source. IndexedDB mirrors successful writes
 * and is used only as a read-only recovery fallback.
 */
export function createDurableOfficialSignatureRepository(): OfficialSignatureRepository {
  const cache = createIndexedDbOfficialSignatureRepository();
  return {
    async getAll() {
      try {
        const records = await requestLocalSignatures();
        if (Array.isArray(records) && records.length > 0) {
          await cache.putMany(records).catch(() => undefined);
          return records.map(normalizeOfficialSignatureRecord).filter(
            (record): record is OfficialSignatureRecord => Boolean(record)
          );
        }
      } catch {
        // Browser cache remains a secondary read fallback.
      }
      return cache.getAll();
    },
    async get(operationId) {
      try {
        const record = await requestLocalSignatures(operationId);
        const normalized = normalizeOfficialSignatureRecord(record);
        if (normalized) {
          await cache.put(normalized).catch(() => undefined);
          return normalized;
        }
      } catch {
        // Browser cache remains a secondary read fallback.
      }
      return cache.get(operationId);
    },
    async put(record) {
      const normalized = normalizeOfficialSignatureRecord(record);
      if (!normalized) throw new Error("Assinatura oficial inválida.");
      await putLocalSignatures([normalized]);
      await cache.put(normalized).catch(() => undefined);
    },
    async putMany(records) {
      const normalized = records
        .map(normalizeOfficialSignatureRecord)
        .filter((record): record is OfficialSignatureRecord => Boolean(record));
      await putLocalSignatures(normalized);
      await cache.putMany(normalized).catch(() => undefined);
    },
  };
}

/** Deterministic adapter for regression tests; production uses IndexedDB. */
export function createMemoryOfficialSignatureRepository(
  initial: readonly OfficialSignatureRecord[] = []
): OfficialSignatureRepository {
  const records = new Map<CampaignProfileId, OfficialSignatureRecord>();
  for (const item of initial) {
    const normalized = normalizeOfficialSignatureRecord(item);
    if (normalized) records.set(normalized.operationId, structuredClone(normalized));
  }
  return {
    async getAll() {
      return [...records.values()].map((item) => structuredClone(item));
    },
    async get(operationId) {
      const record = records.get(operationId);
      return record ? structuredClone(record) : null;
    },
    async put(record) {
      const normalized = normalizeOfficialSignatureRecord(record);
      if (!normalized) throw new Error("Assinatura oficial inválida");
      records.set(normalized.operationId, structuredClone(normalized));
    },
    async putMany(nextRecords) {
      for (const record of nextRecords) await this.put(record);
    },
  };
}
