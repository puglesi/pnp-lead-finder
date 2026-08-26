import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  configureExistingEmailTemplates,
  createInitialEmailTemplates,
  getOriginalEmailTemplateContent,
  normalizeEmailTemplateDefaults,
  type EmailTemplate,
  type EmailTemplateInput,
} from "@/lib/email-template-library";
import { normalizeTemplatesPersistSlice } from "@/lib/store-rehydrate";
import { asArray } from "@/lib/safe-object";
import { assertLocalDataWritable } from "@/lib/local-data-client";

interface EmailTemplateStore {
  templates: EmailTemplate[];
  hasHydrated: boolean;
  markHydrated: () => void;
  addTemplate: (input: EmailTemplateInput) => EmailTemplate;
  updateTemplate: (id: string, input: EmailTemplateInput) => void;
  duplicateTemplate: (id: string) => EmailTemplate | null;
  deleteTemplate: (id: string) => boolean;
  setDefaultTemplate: (id: string) => void;
  restoreOriginal: (id: string) => boolean;
  saveAsTemplate: (input: {
    name: string;
    operation: EmailTemplate["operation"];
    subject: string;
    body: string;
    sender?: string;
    replyTo?: string;
    contactKind?: EmailTemplate["contactKind"];
    replaceId?: string | null;
    setAsDefault?: boolean;
  }) => EmailTemplate | null;
}

function makeId() {
  return `email-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultSenderForOperation(operation: EmailTemplate["operation"]) {
  if (operation === "modeclean") {
    return {
      sender: "outreach@modeclean.co.uk",
      replyTo: "info@modeclean.co.uk",
    };
  }
  return {
    sender: "outreach@panekpuglesi.co.uk",
    replyTo: "info@panekpuglesi.co.uk",
  };
}

export const useEmailTemplateStore = create<EmailTemplateStore>()(
  persist(
    (set, get) => ({
      templates: createInitialEmailTemplates(),
      hasHydrated: false,
      markHydrated: () => set({ hasHydrated: true }),

      addTemplate: (input) => {
        assertLocalDataWritable();
        const now = new Date().toISOString();
        const template: EmailTemplate = {
          ...input,
          id: makeId(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          templates: normalizeEmailTemplateDefaults(
            [...state.templates, template],
            input.isDefault ? template.id : undefined
          ),
        }));
        return template;
      },

      updateTemplate: (id, input) =>
        (assertLocalDataWritable(), set((state) => ({
          templates: normalizeEmailTemplateDefaults(
            state.templates.map((template) =>
              template.id === id
                ? { ...template, ...input, updatedAt: new Date().toISOString() }
                : template
            ),
            input.isDefault ? id : undefined
          ),
        }))),

      duplicateTemplate: (id) => {
        assertLocalDataWritable();
        const source = get().templates.find((template) => template.id === id);
        if (!source) return null;
        return get().addTemplate({
          name: `${source.name} (cópia)`,
          operation: source.operation,
          subject: source.subject,
          body: source.body,
          sender: source.sender,
          replyTo: source.replyTo,
          contactKind: source.contactKind,
          isDefault: false,
        });
      },

      deleteTemplate: (id) => {
        assertLocalDataWritable();
        const source = get().templates.find((template) => template.id === id);
        if (!source) return false;
        const scopedCount = get().templates.filter(
          (template) => template.operation === source.operation
        ).length;
        if (scopedCount <= 1) return false;
        set((state) => ({
          templates: normalizeEmailTemplateDefaults(
            state.templates.filter((template) => template.id !== id)
          ),
        }));
        return true;
      },

      setDefaultTemplate: (id) =>
        (assertLocalDataWritable(), set((state) => ({
          templates: normalizeEmailTemplateDefaults(state.templates, id),
        }))),

      restoreOriginal: (id) => {
        assertLocalDataWritable();
        const original = getOriginalEmailTemplateContent(id);
        if (!original) return false;
        set((state) => ({
          templates: state.templates.map((template) =>
            template.id === id
              ? {
                  ...template,
                  ...original,
                  updatedAt: new Date().toISOString(),
                }
              : template
          ),
        }));
        return true;
      },

      saveAsTemplate: (input) => {
        const name = input.name.trim();
        if (!name || !input.subject.trim() || !input.body.trim()) return null;
        const defaults = getDefaultSenderForOperation(input.operation);
        if (input.replaceId) {
          const existing = get().templates.find((t) => t.id === input.replaceId);
          if (!existing || existing.operation !== input.operation) return null;
          get().updateTemplate(input.replaceId, {
            name,
            operation: input.operation,
            subject: input.subject,
            body: input.body,
            sender: input.sender?.trim() || existing.sender || defaults.sender,
            replyTo: input.replyTo?.trim() || existing.replyTo || defaults.replyTo,
            contactKind: input.contactKind ?? existing.contactKind,
            isDefault: input.setAsDefault ? true : existing.isDefault,
          });
          if (input.setAsDefault) get().setDefaultTemplate(input.replaceId);
          return get().templates.find((t) => t.id === input.replaceId) ?? null;
        }
        return get().addTemplate({
          name,
          operation: input.operation,
          subject: input.subject,
          body: input.body,
          sender: input.sender?.trim() || defaults.sender,
          replyTo: input.replyTo?.trim() || defaults.replyTo,
          contactKind: input.contactKind ?? "first_contact",
          isDefault: Boolean(input.setAsDefault),
        });
      },
    }),
    {
      name: "pnp-email-templates",
      version: 5,
      partialize: (state) => ({ templates: state.templates }),
      migrate: (persisted, version) => {
        const state = persisted as Partial<EmailTemplateStore> | undefined;
        if (!state || !Array.isArray(state.templates) || state.templates.length === 0) {
          return { templates: createInitialEmailTemplates() };
        }
        if (version < 3) {
          return {
            templates: configureExistingEmailTemplates(state.templates),
          };
        }
        // v4/v5: ensure missing stock templates exist, never wipe edits.
        return {
          templates: configureExistingEmailTemplates(state.templates),
        };
      },
      merge: (persisted, current) => {
        const normalized = normalizeTemplatesPersistSlice(persisted);
        const rawTemplates = asArray(normalized.templates);
        const hadTemplatesField =
          persisted &&
          typeof persisted === "object" &&
          "templates" in (persisted as object);
        const templates = hadTemplatesField
          ? configureExistingEmailTemplates(
              rawTemplates as EmailTemplate[]
            )
          : current.templates;
        return {
          ...current,
          templates,
        };
      },
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    }
  )
);
