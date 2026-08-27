import { create } from "zustand";
import type { CampaignSignature } from "../types/campaign.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import {
  createDurableOfficialSignatureRepository,
  createOfficialSignatureBackup,
  createOfficialSignatureRecord,
  LEGACY_OPERATION_SIGNATURE_KEY,
  loadOfficialSignatureRecords,
  parseOfficialSignatureBackup,
  type OfficialSignatureRecord,
} from "../lib/operation-signature-repository.ts";
import {
  isSignatureHtmlEmpty,
  sanitizeSignatureHtml,
} from "../lib/signature-html.ts";

export const OPERATION_SIGNATURE_STORE_VERSION = 3;

/** Stable unconfigured value. It can never represent an enabled empty signature. */
export const EMPTY_OPERATION_SIGNATURE: CampaignSignature = Object.freeze({
  enabled: false,
  body: "",
});

export type OperationSignaturesMap = Record<
  CampaignProfileId,
  CampaignSignature
>;

type SignatureRecordsMap = Partial<
  Record<CampaignProfileId, OfficialSignatureRecord>
>;

interface OperationSignatureStore {
  signatures: OperationSignaturesMap;
  records: SignatureRecordsMap;
  hasHydrated: boolean;
  isHydrating: boolean;
  persistenceError: string | null;
  migratedOperations: CampaignProfileId[];
  getSignature: (operation: CampaignProfileId) => CampaignSignature;
  hydrate: () => Promise<void>;
  saveOfficial: (
    operation: CampaignProfileId,
    signature: CampaignSignature
  ) => Promise<CampaignSignature>;
  exportBackup: () => Promise<string>;
  importBackup: (raw: string) => Promise<void>;
}

function emptySignatures(): OperationSignaturesMap {
  return {
    "panek-puglesi": EMPTY_OPERATION_SIGNATURE,
    modeclean: EMPTY_OPERATION_SIGNATURE,
  };
}

function recordsToSignatures(records: SignatureRecordsMap): OperationSignaturesMap {
  const signatures = emptySignatures();
  for (const operation of ["panek-puglesi", "modeclean"] as const) {
    const record = records[operation];
    if (record) {
      signatures[operation] = {
        enabled: record.enabled,
        body: record.html,
        operation,
      };
    }
  }
  return signatures;
}

/**
 * Compatibility normalizer for old tests/data. Empty enabled entries are
 * repaired to the stable unconfigured state instead of being accepted.
 */
export function normalizeOperationSignatures(raw: unknown): OperationSignaturesMap {
  if (!raw || typeof raw !== "object") return emptySignatures();
  const state = raw as {
    signatures?: Partial<Record<CampaignProfileId, unknown>>;
  };
  const values = state.signatures ?? (raw as Record<string, unknown>);
  const result = emptySignatures();
  for (const operation of ["panek-puglesi", "modeclean"] as const) {
    const entry = values[operation];
    if (!entry || typeof entry !== "object") continue;
    const signature = entry as Partial<CampaignSignature>;
    if (typeof signature.body !== "string") continue;
    const body = sanitizeSignatureHtml(signature.body);
    if (isSignatureHtmlEmpty(body)) continue;
    result[operation] = {
      enabled: signature.enabled !== false,
      body,
      operation,
    };
  }
  return result;
}

export function selectOperationSignature(
  signatures: OperationSignaturesMap | null | undefined,
  operation: CampaignProfileId
): CampaignSignature {
  if (!signatures) return EMPTY_OPERATION_SIGNATURE;
  return signatures[operation] ?? EMPTY_OPERATION_SIGNATURE;
}

let hydrationPromise: Promise<void> | null = null;

export const useOperationSignatureStore = create<OperationSignatureStore>()(
  (set, get) => ({
    signatures: emptySignatures(),
    records: {},
    hasHydrated: false,
    isHydrating: false,
    persistenceError: null,
    migratedOperations: [],

    getSignature: (operation) =>
      selectOperationSignature(get().signatures, operation),

    hydrate: async () => {
      if (hydrationPromise) return hydrationPromise;
      const configured = Object.values(get().records).some(
        (record) => record && !isSignatureHtmlEmpty(record.html)
      );
      if (get().hasHydrated && configured) return;
      hydrationPromise = (async () => {
        set({ isHydrating: true, persistenceError: null });
        try {
          const legacyRaw =
            typeof localStorage === "undefined"
              ? null
              : localStorage.getItem(LEGACY_OPERATION_SIGNATURE_KEY);
          const loaded = await loadOfficialSignatureRecords(
            createDurableOfficialSignatureRepository(),
            legacyRaw
          );
          set({
            records: loaded.records,
            signatures: recordsToSignatures(loaded.records),
            hasHydrated: true,
            isHydrating: false,
            persistenceError: null,
            migratedOperations: loaded.migratedOperations,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Falha ao carregar assinaturas oficiais";
          set({
            hasHydrated: false,
            isHydrating: false,
            persistenceError: message,
          });
          throw error;
        } finally {
          hydrationPromise = null;
        }
      })();
      return hydrationPromise;
    },

    saveOfficial: async (operation, signature) => {
      await get().hydrate();
      const record = createOfficialSignatureRecord({
        operationId: operation,
        enabled: signature.enabled !== false,
        html: signature.body,
      });
      try {
        await createDurableOfficialSignatureRepository().put(record);
        const records = { ...get().records, [operation]: record };
        const official: CampaignSignature = {
          enabled: record.enabled,
          body: record.html,
          operation,
        };
        set({
          records,
          signatures: { ...get().signatures, [operation]: official },
          persistenceError: null,
        });
        return official;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Falha ao salvar assinatura oficial";
        set({ persistenceError: message });
        throw error;
      }
    },

    exportBackup: async () => {
      await get().hydrate();
      const backup = createOfficialSignatureBackup(
        Object.values(get().records).filter(
          (record): record is OfficialSignatureRecord => Boolean(record)
        )
      );
      return JSON.stringify(backup, null, 2);
    },

    importBackup: async (raw) => {
      const backup = parseOfficialSignatureBackup(raw);
      try {
        await get().hydrate();
        await createDurableOfficialSignatureRepository().putMany(
          backup.signatures
        );
        const records = { ...get().records };
        for (const record of backup.signatures) {
          records[record.operationId] = record;
        }
        set({
          records,
          signatures: recordsToSignatures(records),
          hasHydrated: true,
          persistenceError: null,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Falha ao importar backup de assinaturas";
        set({ persistenceError: message });
        throw error;
      }
    },
  })
);

export async function ensureOperationSignaturesHydrated(): Promise<void> {
  await useOperationSignatureStore.getState().hydrate();
}
