import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CampaignSignature } from "../types/campaign.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import { sanitizeSignatureHtml } from "../lib/signature-html.ts";

/**
 * Per-operation email signatures (user-owned HTML from Gmail paste).
 * Empty body means “not set yet” — never force a legacy hardcoded default over user content.
 *
 * CRITICAL for React/Zustand: never return freshly allocated objects from
 * selectors/getters used by useSyncExternalStore, or getSnapshot loops forever.
 */

/** Stable empty signature — same reference for every missing/empty read. */
export const EMPTY_OPERATION_SIGNATURE: CampaignSignature = Object.freeze({
  enabled: true,
  body: "",
});

export type OperationSignaturesMap = Record<
  CampaignProfileId,
  CampaignSignature
>;

interface OperationSignatureStore {
  signatures: OperationSignaturesMap;
  /**
   * Imperative read. Returns the stored reference or EMPTY_OPERATION_SIGNATURE.
   * Does NOT clone — safe for use outside React selectors.
   */
  getSignature: (operation: CampaignProfileId) => CampaignSignature;
  setSignature: (
    operation: CampaignProfileId,
    patch: Partial<CampaignSignature>
  ) => void;
  /** Persist official signature for the operation (sanitized). */
  saveOfficial: (
    operation: CampaignProfileId,
    signature: CampaignSignature
  ) => CampaignSignature;
}

function normalizeSignatureEntry(
  raw: unknown,
  fallback: CampaignSignature
): CampaignSignature {
  if (!raw || typeof raw !== "object") {
    return fallback === EMPTY_OPERATION_SIGNATURE
      ? EMPTY_OPERATION_SIGNATURE
      : fallback;
  }
  const e = raw as Partial<CampaignSignature>;
  const body =
    typeof e.body === "string" ? sanitizeSignatureHtml(e.body) : fallback.body;
  const enabled = typeof e.enabled === "boolean" ? e.enabled : true;
  // Keep EMPTY reference when empty/default
  if (enabled === true && body === "") {
    return EMPTY_OPERATION_SIGNATURE;
  }
  return { enabled, body };
}

export function normalizeOperationSignatures(
  raw: unknown
): OperationSignaturesMap {
  if (!raw || typeof raw !== "object") {
    return {
      "panek-puglesi": EMPTY_OPERATION_SIGNATURE,
      modeclean: EMPTY_OPERATION_SIGNATURE,
    };
  }
  const state = raw as {
    signatures?: Partial<Record<CampaignProfileId, unknown>>;
  };
  const signatures = state.signatures ?? (raw as Record<string, unknown>);
  return {
    "panek-puglesi": normalizeSignatureEntry(
      (signatures as Record<string, unknown>)["panek-puglesi"],
      EMPTY_OPERATION_SIGNATURE
    ),
    modeclean: normalizeSignatureEntry(
      (signatures as Record<string, unknown>).modeclean,
      EMPTY_OPERATION_SIGNATURE
    ),
  };
}

/**
 * Pure stable selector helper (usable in React + tests).
 * Always returns an existing map entry or the frozen EMPTY constant.
 */
export function selectOperationSignature(
  signatures: OperationSignaturesMap | null | undefined,
  operation: CampaignProfileId
): CampaignSignature {
  if (!signatures) return EMPTY_OPERATION_SIGNATURE;
  return signatures[operation] ?? EMPTY_OPERATION_SIGNATURE;
}

export const useOperationSignatureStore = create<OperationSignatureStore>()(
  persist(
    (set, get) => ({
      signatures: {
        "panek-puglesi": EMPTY_OPERATION_SIGNATURE,
        modeclean: EMPTY_OPERATION_SIGNATURE,
      },

      getSignature: (operation) =>
        selectOperationSignature(get().signatures, operation),

      setSignature: (operation, patch) =>
        set((state) => {
          const prev = selectOperationSignature(state.signatures, operation);
          const nextEnabled =
            typeof patch.enabled === "boolean" ? patch.enabled : prev.enabled;
          const nextBody =
            typeof patch.body === "string"
              ? sanitizeSignatureHtml(patch.body)
              : prev.body;

          // No-op if nothing changed — keep previous reference stable.
          if (nextEnabled === prev.enabled && nextBody === prev.body) {
            return state;
          }

          const nextEntry: CampaignSignature =
            nextEnabled === true && nextBody === ""
              ? EMPTY_OPERATION_SIGNATURE
              : { enabled: nextEnabled, body: nextBody };

          // If same object identity as empty, and prev was empty, no update.
          if (nextEntry === prev) return state;

          return {
            signatures: {
              ...state.signatures,
              [operation]: nextEntry,
            },
          };
        }),

      saveOfficial: (operation, signature) => {
        const enabled = signature.enabled !== false;
        const body = sanitizeSignatureHtml(signature.body ?? "");
        const official: CampaignSignature =
          enabled === true && body === ""
            ? EMPTY_OPERATION_SIGNATURE
            : { enabled, body };

        const prev = selectOperationSignature(
          get().signatures,
          operation
        );
        if (prev.enabled === official.enabled && prev.body === official.body) {
          return prev;
        }

        set((state) => ({
          signatures: {
            ...state.signatures,
            [operation]: official,
          },
        }));
        return official;
      },
    }),
    {
      name: "pnp-operation-signatures",
      version: 2,
      migrate: (persisted) => ({
        signatures: normalizeOperationSignatures(persisted),
      }),
      merge: (persisted, current) => ({
        ...current,
        signatures: normalizeOperationSignatures(persisted ?? current),
      }),
    }
  )
);
