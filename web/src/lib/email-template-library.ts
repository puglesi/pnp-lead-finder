import type { CampaignProfileId } from "../types/campaign-profile.ts";
import type { EmailContactKind } from "./global-email-deduplication.ts";

export interface EmailTemplate {
  id: string;
  name: string;
  operation: CampaignProfileId;
  subject: string;
  body: string;
  sender: string;
  replyTo: string;
  contactKind: EmailContactKind;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EmailTemplateInput = Pick<
  EmailTemplate,
  | "name"
  | "operation"
  | "subject"
  | "body"
  | "sender"
  | "replyTo"
  | "contactKind"
  | "isDefault"
>;

const PNP_SENDER = "outreach@panekpuglesi.co.uk";
const PNP_REPLY_TO = "info@panekpuglesi.co.uk";
const MODECLEAN_SENDER = "outreach@modeclean.co.uk";
const MODECLEAN_REPLY_TO = "info@modeclean.co.uk";

interface ConfiguredTemplateContent {
  key: string;
  name: string;
  subject: string;
  body: string;
}

const CONFIGURED_CONTENT: Record<
  CampaignProfileId,
  readonly ConfiguredTemplateContent[]
> = {
  "panek-puglesi": [
    {
      key: "partnership",
      name: "Parceria B2B",
      subject: "A potential property partnership for {{company}}",
      body: `<p>Hi {{name}},</p>
<p>Your clients could benefit from joined-up property support when they need lettings, management or relocation advice.</p>
<p>I’m reaching out from Panek &amp; Puglesi because <strong>{{company}}</strong> appears well placed to support people making important property decisions. We would be glad to explore a practical referral partnership that keeps their experience clear and personal.</p>
<p>Would a brief introductory call be useful?</p>
<p>If {{email}} is not the right inbox, who would be best to contact? You can also learn more at <a href="{{website}}">{{website}}</a>.</p>
<p>Kind regards,<br>Panek &amp; Puglesi</p>`,
    },
    {
      key: "commercial-introduction",
      name: "Apresentação comercial",
      subject: "Making property ownership easier for {{company}}",
      body: `<p>Hi {{name}},</p>
<p>Managing property should take less time and create fewer day-to-day demands for landlords and investors.</p>
<p>Panek &amp; Puglesi provides lettings, property management, relocation and practical support for property owners. From <a href="{{website}}">{{website}}</a>, it looks as though <strong>{{company}}</strong> may have property needs where a more personal approach would help.</p>
<p>Would a brief conversation be worthwhile?</p>
<p>If {{email}} is not the best contact, please point me towards the right person.</p>
<p>Kind regards,<br>Panek &amp; Puglesi</p>`,
    },
    {
      key: "follow-up",
      name: "Follow-up",
      subject: "Following up with {{company}}",
      body: `<p>Hi {{name}},</p>
<p>A quick conversation could clarify whether our property support would be useful to <strong>{{company}}</strong> or its clients.</p>
<p>I’m following up on my earlier note about Panek &amp; Puglesi. You can see our approach at <a href="{{website}}">{{website}}</a>.</p>
<p>Would it make sense to speak briefly, or should I contact someone else?</p>
<p>If {{email}} is not the right inbox, a quick redirection would be appreciated.</p>
<p>Kind regards,<br>Panek &amp; Puglesi</p>`,
    },
  ],
  modeclean: [
    {
      key: "partnership",
      name: "Proposta de limpeza comercial",
      subject: "A cleaner, easier-to-manage workplace for {{company}}",
      body: `<p>Hi {{name}},</p>
<p>A consistently clean workplace can make daily operations easier for your team and create a more welcoming environment.</p>
<p>Modeclean provides recurring professional cleaning for businesses, residential developments and property managers. From <a href="{{website}}">{{website}}</a>, <strong>{{company}}</strong> looks like an organisation where dependable cleaning support may be valuable.</p>
<p>Would you be open to a brief conversation about your current requirements?</p>
<p>If {{email}} is not the right inbox, who would be best to contact?</p>
<p>Kind regards,<br>Modeclean</p>`,
    },
    {
      key: "commercial-introduction",
      name: "Apresentação Modeclean",
      subject: "Reliable cleaning support for {{company}}",
      body: `<p>Hi {{name}},</p>
<p>Reliable cleaning cover can give your team one less operational concern and help keep every space ready for the people who use it.</p>
<p>Modeclean offers professional cleaning with a practical, responsive approach. We would be pleased to understand the priorities at <strong>{{company}}</strong> and discuss availability that suits your operation.</p>
<p>Would a short introductory call be helpful?</p>
<p>If {{email}} is not the best contact, please let me know who is. More information is available at <a href="{{website}}">{{website}}</a>.</p>
<p>Kind regards,<br>Modeclean</p>`,
    },
    {
      key: "follow-up",
      name: "Follow-up Modeclean",
      subject: "Following up on cleaning support for {{company}}",
      body: `<p>Hi {{name}},</p>
<p>A quick reply could help establish whether reliable cleaning support would make operations easier for <strong>{{company}}</strong>.</p>
<p>I’m following up on my earlier Modeclean introduction. You can review our company at <a href="{{website}}">{{website}}</a>.</p>
<p>Would a brief conversation be useful, or is there a better time to reconnect?</p>
<p>If {{email}} is not the right inbox, a quick redirection would be appreciated.</p>
<p>Kind regards,<br>Modeclean</p>`,
    },
  ],
};

export function createInitialEmailTemplates(
  now = new Date().toISOString()
): EmailTemplate[] {
  return ([
    {
      operation: "panek-puglesi" as const,
      sender: PNP_SENDER,
      replyTo: PNP_REPLY_TO,
    },
    {
      operation: "modeclean" as const,
      sender: MODECLEAN_SENDER,
      replyTo: MODECLEAN_REPLY_TO,
    },
  ] as const).flatMap((profile) =>
    CONFIGURED_CONTENT[profile.operation].map((content, index) => ({
      id: `${profile.operation}-${content.key}`,
      name: content.name,
      operation: profile.operation,
      subject: content.subject,
      body: content.body,
      sender: profile.sender,
      replyTo: profile.replyTo,
      contactKind: content.key === "follow-up" ? "follow_up" : "first_contact",
      isDefault: index === 0,
      createdAt: now,
      updatedAt: now,
    }))
  );
}

/**
 * Ensure the six stock templates exist, without overwriting user edits.
 * Previously this rewrote subject/body on every migrate and wiped edits.
 */
export function configureExistingEmailTemplates(
  templates: readonly EmailTemplate[],
  now = new Date().toISOString()
): EmailTemplate[] {
  const configured = createInitialEmailTemplates(now);
  const existingIds = new Set(templates.map((template) => template.id));

  const preserved = templates.map((template) => ({
    ...template,
    contactKind: template.contactKind ?? "first_contact",
  }));

  const missing = configured.filter((template) => !existingIds.has(template.id));
  return normalizeEmailTemplateDefaults([...preserved, ...missing]);
}

/** Built-in original content for restore (never silently mutates store). */
export function getOriginalEmailTemplateContent(
  templateId: string
): Pick<EmailTemplate, "name" | "subject" | "body" | "contactKind"> | null {
  for (const operation of ["panek-puglesi", "modeclean"] as const) {
    for (const content of CONFIGURED_CONTENT[operation]) {
      const id = `${operation}-${content.key}`;
      if (id === templateId) {
        return {
          name: content.name,
          subject: content.subject,
          body: content.body,
          contactKind:
            content.key === "follow-up" ? "follow_up" : "first_contact",
        };
      }
    }
  }
  return null;
}

export function isBuiltInEmailTemplateId(templateId: string): boolean {
  return getOriginalEmailTemplateContent(templateId) !== null;
}

export function normalizeEmailTemplateDefaults(
  templates: readonly EmailTemplate[],
  preferredDefaultId?: string
): EmailTemplate[] {
  const preferred = templates.find((template) => template.id === preferredDefaultId);
  const operations: CampaignProfileId[] = ["panek-puglesi", "modeclean"];

  return operations.flatMap((operation) => {
    const scoped = templates.filter((template) => template.operation === operation);
    if (scoped.length === 0) return [];

    const chosenId =
      preferred?.operation === operation
        ? preferred.id
        : scoped.find((template) => template.isDefault)?.id ?? scoped[0].id;

    return scoped.map((template) => ({
      ...template,
      isDefault: template.id === chosenId,
    }));
  });
}

export function getEmailTemplatesForOperation(
  templates: readonly EmailTemplate[],
  operation: CampaignProfileId
): EmailTemplate[] {
  return templates.filter((template) => template.operation === operation);
}

export function getDefaultEmailTemplate(
  templates: readonly EmailTemplate[],
  operation: CampaignProfileId
): EmailTemplate | undefined {
  const scoped = getEmailTemplatesForOperation(templates, operation);
  return scoped.find((template) => template.isDefault) ?? scoped[0];
}

export function getEmailTemplateSenderName(operation: CampaignProfileId): string {
  return operation === "modeclean" ? "Modeclean" : "Panek & Puglesi";
}
