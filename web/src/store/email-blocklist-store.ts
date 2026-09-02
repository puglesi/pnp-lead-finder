import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createEmailBlocklistEntry,
  findEmailBlock,
  isEmailBlockOperationScope,
  isEmailBlockReason,
  isEmailBlocked,
  parseEmailListInput,
  type EmailBlocklistEntry,
  type EmailBlockOperationScope,
  type EmailBlockReason,
} from "@/lib/email-blocklist";
import { normalizeEmail } from "@/lib/email-validation";
import {
  normalizeBlocklistPersistSlice,
  sqliteWinsArrayMerge,
} from "@/lib/store-rehydrate";
import { asArray } from "@/lib/safe-object";
import { assertLocalDataWritable } from "@/lib/local-data-client";
import {
  deleteBlocklistEntry,
  persistBlocklistEntries,
} from "@/lib/email-blocklist-repository";

interface EmailBlocklistStore {
  entries: EmailBlocklistEntry[];
  addEmail: (input: {
    email: string;
    reason: EmailBlockReason;
    operation?: EmailBlockOperationScope;
    note?: string;
  }) => Promise<EmailBlocklistEntry | null>;
  addEmails: (input: {
    raw: string;
    reason: EmailBlockReason;
    operation?: EmailBlockOperationScope;
    note?: string;
  }) => Promise<{ added: number; skipped: number; invalid: number }>;
  removeEmail: (normalizedEmail: string) => Promise<boolean>;
  removeById: (id: string) => Promise<boolean>;
  isBlocked: (
    email: string | null | undefined,
    operation?: EmailBlockOperationScope | CampaignProfileOnly
  ) => boolean;
  findBlock: (
    email: string | null | undefined,
    operation?: CampaignProfileOnly
  ) => EmailBlocklistEntry | null;
  getAll: () => EmailBlocklistEntry[];
}

type CampaignProfileOnly = "panek-puglesi" | "modeclean";

export const useEmailBlocklistStore = create<EmailBlocklistStore>()(
  persist(
    (set, get) => ({
      entries: [],

      addEmail: async (input) => {
        assertLocalDataWritable();
        const entry = createEmailBlocklistEntry(input);
        if (!entry) return null;
        await persistBlocklistEntries([entry]);
        set((state) => {
          const without = state.entries.filter(
            (item) => item.normalizedEmail !== entry.normalizedEmail
          );
          return { entries: [entry, ...without] };
        });
        return entry;
      },

      addEmails: async (input) => {
        assertLocalDataWritable();
        const emails = parseEmailListInput(input.raw);
        let added = 0;
        let skipped = 0;
        const invalidTokens = input.raw
          .split(/[\s,;]+/g)
          .map((t) => t.trim())
          .filter(Boolean);
        let invalid = 0;
        for (const token of invalidTokens) {
          if (!normalizeEmail(token)) invalid += 1;
        }
        const current = get().entries;
        const additions: EmailBlocklistEntry[] = [];
        for (const email of emails) {
          if (
            current.some((item) => item.normalizedEmail === email) ||
            additions.some((item) => item.normalizedEmail === email)
          ) {
            skipped += 1;
            continue;
          }
          const entry = createEmailBlocklistEntry({
            email,
            reason: input.reason,
            operation: input.operation,
            note: input.note,
          });
          if (!entry) continue;
          additions.push(entry);
          added += 1;
        }
        await persistBlocklistEntries(additions);
        set((state) => ({ entries: [...additions].reverse().concat(state.entries) }));
        return { added, skipped, invalid };
      },

      removeEmail: async (normalizedEmail) => {
        assertLocalDataWritable();
        const email = normalizeEmail(normalizedEmail);
        if (!email) return false;
        const matches = get().entries.filter(
          (item) => item.normalizedEmail === email
        );
        if (matches.length === 0) return false;
        await Promise.all(matches.map((item) => deleteBlocklistEntry(item.id)));
        const before = get().entries.length;
        set((state) => ({
          entries: state.entries.filter(
            (item) => item.normalizedEmail !== email
          ),
        }));
        return get().entries.length < before;
      },

      removeById: async (id) => {
        assertLocalDataWritable();
        const before = get().entries.length;
        if (!get().entries.some((item) => item.id === id)) return false;
        await deleteBlocklistEntry(id);
        set((state) => ({
          entries: state.entries.filter((item) => item.id !== id),
        }));
        return get().entries.length < before;
      },

      isBlocked: (email, operation) => {
        const profile =
          operation && operation !== "both"
            ? (operation as CampaignProfileOnly)
            : undefined;
        return isEmailBlocked(get().entries, email, profile);
      },

      findBlock: (email, operation) =>
        findEmailBlock(get().entries, email, operation),

      getAll: () => get().entries,
    }),
    {
      name: "pnp-email-blocklist",
      skipHydration: true,
      version: 2,
      migrate: (persisted) => {
        const state = persisted as { entries?: unknown } | null;
        if (!state || !Array.isArray(state.entries)) {
          return { entries: [] };
        }
        const entries: EmailBlocklistEntry[] = [];
        for (const raw of state.entries) {
          if (!raw || typeof raw !== "object") continue;
          const item = raw as Record<string, unknown>;
          const normalizedEmail = normalizeEmail(
            typeof item.normalizedEmail === "string"
              ? item.normalizedEmail
              : typeof item.email === "string"
                ? item.email
                : null
          );
          if (!normalizedEmail) continue;
          const reason = isEmailBlockReason(item.reason)
            ? item.reason
            : "manual";
          const operation = isEmailBlockOperationScope(item.operation)
            ? item.operation
            : "both";
          entries.push({
            id:
              typeof item.id === "string"
                ? item.id
                : `block-${normalizedEmail}`,
            normalizedEmail,
            reason,
            operation,
            note:
              typeof item.note === "string" && item.note.trim()
                ? item.note.trim()
                : undefined,
            blockedAt:
              typeof item.blockedAt === "string"
                ? item.blockedAt
                : new Date().toISOString(),
            source: item.source === "system" ? "system" : "manual",
          });
        }
        return { entries };
      },
      merge: (persisted, current) => {
        // Exact field: entries must be an array of valid shapes before UI maps/labels.
        const normalized = normalizeBlocklistPersistSlice(persisted);
        const rawEntries = asArray(normalized.entries);
        const entries: EmailBlocklistEntry[] = [];
        for (const raw of rawEntries) {
          if (!raw || typeof raw !== "object") continue;
          const item = raw as Record<string, unknown>;
          const normalizedEmail = normalizeEmail(
            typeof item.normalizedEmail === "string"
              ? item.normalizedEmail
              : typeof item.email === "string"
                ? item.email
                : null
          );
          if (!normalizedEmail) continue;
          const reason = isEmailBlockReason(item.reason)
            ? item.reason
            : "manual";
          const operation = isEmailBlockOperationScope(item.operation)
            ? item.operation
            : "both";
          entries.push({
            id:
              typeof item.id === "string"
                ? item.id
                : `block-${normalizedEmail}`,
            normalizedEmail,
            reason,
            operation,
            note:
              typeof item.note === "string" && item.note.trim()
                ? item.note.trim()
                : undefined,
            blockedAt:
              typeof item.blockedAt === "string"
                ? item.blockedAt
                : new Date().toISOString(),
            source: item.source === "system" ? "system" : "manual",
          });
        }
        return {
          ...current,
          entries: sqliteWinsArrayMerge(
            current.entries,
            entries,
            (entry) => entry.normalizedEmail || entry.id
          ),
        };
      },
    }
  )
);
