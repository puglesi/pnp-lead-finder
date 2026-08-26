import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LeadBatch, PipelineStage } from "@/types/batch";
import { advancePipelineStage, createLeadBatch } from "@/lib/lead-batch";
import { createDurableSearchBatchRepository } from "@/lib/search/batch-repository";
import { assertLocalDataWritable } from "@/lib/local-data-client";

const durableSearchBatches = createDurableSearchBatchRepository();

function persistPipelineStage(batchId: string, stage: PipelineStage): void {
  if (typeof indexedDB === "undefined") return;
  const durableStage =
    stage === "garimpo"
      ? "enrichment"
      : stage === "validation"
        ? "validation"
        : stage === "search"
          ? "search"
          : "completed";
  void durableSearchBatches
    .getBatch(batchId)
    .then((batch) =>
      batch ? durableSearchBatches.setStage(batchId, durableStage) : null
    )
    .catch((error) => {
      console.error("[search-checkpoint/stage]", error);
    });
}

interface BatchPipelineStore {
  activeBatchId: string | null;
  batches: Record<string, LeadBatch>;
  registerSearchBatch: (input: {
    sector: string;
    location: string;
    foundCount: number;
    searchRecordId?: string;
    createdAt?: string;
    leadIds?: readonly string[];
  }) => LeadBatch;
  /** Persist an already-built batch (legacy migration / rehydrate). */
  upsertBatch: (batch: LeadBatch) => void;
  setActiveBatch: (batchId: string | null) => void;
  updateBatchStage: (batchId: string, stage: PipelineStage) => void;
  attachCampaign: (batchId: string, campaignId: string) => void;
  getActiveBatch: () => LeadBatch | null;
  getBatch: (batchId: string) => LeadBatch | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBatch(value: unknown): LeadBatch | null {
  if (!isRecord(value)) return null;
  if (typeof value.batchId !== "string") return null;
  if (typeof value.sector !== "string") return null;
  if (typeof value.location !== "string") return null;
  if (typeof value.createdAt !== "string") return null;
  if (typeof value.foundCount !== "number") return null;
  if (typeof value.label !== "string") return null;
  const stage = value.stage;
  const validStage =
    stage === "search" ||
    stage === "garimpo" ||
    stage === "validation" ||
    stage === "campaign" ||
    stage === "send" ||
    stage === "complete"
      ? stage
      : "search";
  return {
    batchId: value.batchId,
    sector: value.sector,
    location: value.location,
    createdAt: value.createdAt,
    foundCount: Math.max(0, Math.floor(value.foundCount)),
    stage: validStage,
    searchRecordId:
      typeof value.searchRecordId === "string"
        ? value.searchRecordId
        : undefined,
    campaignId:
      typeof value.campaignId === "string" ? value.campaignId : undefined,
    label: value.label,
    leadIds: Array.isArray(value.leadIds)
      ? value.leadIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0
        )
      : undefined,
  };
}

export const useBatchPipelineStore = create<BatchPipelineStore>()(
  persist(
    (set, get) => ({
      activeBatchId: null,
      batches: {},

      registerSearchBatch: (input) => {
        assertLocalDataWritable();
        const batch = createLeadBatch({
          sector: input.sector,
          location: input.location,
          foundCount: input.foundCount,
          createdAt: input.createdAt,
          searchRecordId: input.searchRecordId,
          stage: "search",
          leadIds: input.leadIds,
        });
        set((state) => ({
          activeBatchId: batch.batchId,
          batches: {
            ...state.batches,
            [batch.batchId]: batch,
          },
        }));
        return batch;
      },

      upsertBatch: (batch) =>
        (assertLocalDataWritable(), set((state) => ({
          activeBatchId: batch.batchId,
          batches: {
            ...state.batches,
            [batch.batchId]: batch,
          },
        }))),

      setActiveBatch: (batchId) =>
        set((state) => {
          // Always accept explicit selection (URL handoff). Null clears.
          // Unknown ids are kept so a late rehydrate can resolve metadata.
          if (batchId === null) return { activeBatchId: null };
          if (state.activeBatchId === batchId) return state;
          return { activeBatchId: batchId };
        }),

      updateBatchStage: (batchId, stage) =>
        (assertLocalDataWritable(), set((state) => {
          const existing = state.batches[batchId];
          if (!existing) return state;
          const nextStage = advancePipelineStage(existing.stage, stage);
          if (nextStage === existing.stage) return state;
          persistPipelineStage(batchId, nextStage);
          return {
            batches: {
              ...state.batches,
              [batchId]: {
                ...existing,
                stage: nextStage,
              },
            },
          };
        })),

      attachCampaign: (batchId, campaignId) =>
        (assertLocalDataWritable(), set((state) => {
          const existing = state.batches[batchId];
          if (!existing) return state;
          return {
            batches: {
              ...state.batches,
              [batchId]: {
                ...existing,
                campaignId,
                stage: advancePipelineStage(existing.stage, "campaign"),
              },
            },
          };
        })),

      getActiveBatch: () => {
        const { activeBatchId, batches } = get();
        if (!activeBatchId) return null;
        return batches[activeBatchId] ?? null;
      },

      getBatch: (batchId) => get().batches[batchId] ?? null,
    }),
    {
      name: "pnp-batch-pipeline",
      version: 1,
      // Batches are durable; activeBatchId is session UI (cleared on new session).
      partialize: (state) => ({
        batches: state.batches,
      }),
      merge: (persisted, current) => {
        if (!isRecord(persisted)) return current;
        const rawBatches = isRecord(persisted.batches) ? persisted.batches : {};
        const batches: Record<string, LeadBatch> = {};
        for (const [key, value] of Object.entries(rawBatches)) {
          const batch = normalizeBatch(value);
          if (batch) batches[key] = batch;
        }
        return {
          ...current,
          activeBatchId: null,
          batches,
        };
      },
    }
  )
);
