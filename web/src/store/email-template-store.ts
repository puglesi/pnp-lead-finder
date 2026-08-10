import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  configureExistingEmailTemplates,
  createInitialEmailTemplates,
  normalizeEmailTemplateDefaults,
  type EmailTemplate,
  type EmailTemplateInput,
} from "@/lib/email-template-library";

interface EmailTemplateStore {
  templates: EmailTemplate[];
  hasHydrated: boolean;
  markHydrated: () => void;
  addTemplate: (input: EmailTemplateInput) => EmailTemplate;
  updateTemplate: (id: string, input: EmailTemplateInput) => void;
  duplicateTemplate: (id: string) => EmailTemplate | null;
  deleteTemplate: (id: string) => boolean;
  setDefaultTemplate: (id: string) => void;
}

function makeId() {
  return `email-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useEmailTemplateStore = create<EmailTemplateStore>()(
  persist(
    (set, get) => ({
      templates: createInitialEmailTemplates(),
      hasHydrated: false,
      markHydrated: () => set({ hasHydrated: true }),

      addTemplate: (input) => {
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
        set((state) => ({
          templates: normalizeEmailTemplateDefaults(
            state.templates.map((template) =>
              template.id === id
                ? { ...template, ...input, updatedAt: new Date().toISOString() }
                : template
            ),
            input.isDefault ? id : undefined
          ),
        })),

      duplicateTemplate: (id) => {
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
        set((state) => ({
          templates: normalizeEmailTemplateDefaults(state.templates, id),
        })),
    }),
    {
      name: "pnp-email-templates",
      version: 3,
      partialize: (state) => ({ templates: state.templates }),
      migrate: (persisted, version) => {
        const state = persisted as Partial<EmailTemplateStore> | undefined;
        if (!state?.templates?.length) {
          return { templates: createInitialEmailTemplates() };
        }
        if (version < 3) {
          return {
            templates: configureExistingEmailTemplates(state.templates),
          };
        }
        return { templates: normalizeEmailTemplateDefaults(state.templates) };
      },
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    }
  )
);
