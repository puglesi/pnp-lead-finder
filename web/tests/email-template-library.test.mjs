import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  configureExistingEmailTemplates,
  createInitialEmailTemplates,
  getDefaultEmailTemplate,
  getEmailTemplatesForOperation,
  normalizeEmailTemplateDefaults,
} from "../src/lib/email-template-library.ts";

const now = "2026-08-06T12:00:00.000Z";

test("modelos 1. cria os três modelos iniciais para cada operação", () => {
  const templates = createInitialEmailTemplates(now);
  assert.equal(templates.length, 6);

  const expectedNames = {
    "panek-puglesi": ["Parceria B2B", "Apresentação comercial", "Follow-up"],
    modeclean: [
      "Proposta de limpeza comercial",
      "Apresentação Modeclean",
      "Follow-up Modeclean",
    ],
  };

  for (const operation of ["panek-puglesi", "modeclean"]) {
    const scoped = getEmailTemplatesForOperation(templates, operation);
    assert.deepEqual(scoped.map((template) => template.name), expectedNames[operation]);
    assert.equal(scoped.filter((template) => template.isDefault).length, 1);
    assert.equal(getDefaultEmailTemplate(templates, operation)?.id.endsWith("partnership"), true);
    assert.equal(scoped.every((template) => template.operation === operation), true);
    assert.equal(scoped.every((template) => template.subject && template.body), true);
  }
});

test("modelos 2. conteúdo inicial preserva todas as variáveis obrigatórias", () => {
  const templates = createInitialEmailTemplates(now);
  for (const template of templates) {
    const content = `${template.subject}\n${template.body}`;
    for (const variable of ["{{company}}", "{{name}}", "{{email}}", "{{website}}"]) {
      assert.equal(content.includes(variable), true, `${template.id}: ${variable}`);
    }
  }
});

test("modelos 3. normalização mantém somente um padrão por operação", () => {
  const templates = createInitialEmailTemplates(now).map((template) => ({
    ...template,
    isDefault: true,
  }));
  const modecleanFollowUp = templates.find(
    (template) => template.id === "modeclean-follow-up"
  );
  const normalized = normalizeEmailTemplateDefaults(
    templates,
    modecleanFollowUp.id
  );

  assert.equal(
    getEmailTemplatesForOperation(normalized, "panek-puglesi").filter(
      (template) => template.isDefault
    ).length,
    1
  );
  assert.equal(
    getDefaultEmailTemplate(normalized, "modeclean")?.id,
    modecleanFollowUp.id
  );
});

test("modelos 4. integrações usam a biblioteca e não oferecem campanha antiga", () => {
  const oneClick = readFileSync(
    new URL("../src/components/outreach/one-click-outreach.tsx", import.meta.url),
    "utf8"
  );
  const hook = readFileSync(
    new URL("../src/hooks/use-one-click-outreach.ts", import.meta.url),
    "utf8"
  );
  const manual = readFileSync(
    new URL("../src/components/campaigns/create-campaign-form.tsx", import.meta.url),
    "utf8"
  );

  assert.match(oneClick, /useEmailTemplateStore/);
  assert.equal(oneClick.includes("useCampaignStore"), false);
  assert.equal(oneClick.includes("Campanha ·"), false);
  assert.match(hook, /useEmailTemplateStore\.getState\(\)\.templates/);
  assert.match(manual, /getEmailTemplatesForOperation/);
});

test("modelos 5. área de configurações expõe CRUD e padrão", () => {
  const source = readFileSync(
    new URL("../src/components/settings/email-template-library.tsx", import.meta.url),
    "utf8"
  );
  for (const action of [
    "Novo modelo",
    "Editar",
    "Duplicar",
    "Excluir",
    "Definir como padrão",
  ]) {
    assert.equal(source.includes(action), true, action);
  }
});

test("modelos 6. configuração preserva edições do usuário e preenche faltantes", () => {
  const old = createInitialEmailTemplates("2026-08-01T00:00:00.000Z").map(
    (template) => ({
      ...template,
      name: "Antigo",
      subject: "Old subject",
      body: "Old body",
      sender: `${template.operation}@sender.example`,
      replyTo: `${template.operation}@reply.example`,
      isDefault: template.id.endsWith("follow-up"),
    })
  );
  // Drop one stock template — configure should re-add without wiping edits.
  const incomplete = old.filter((t) => t.id !== "modeclean-follow-up");
  const configured = configureExistingEmailTemplates(incomplete, now);

  assert.equal(configured.length, 6);
  for (const operation of ["panek-puglesi", "modeclean"]) {
    const scoped = getEmailTemplatesForOperation(configured, operation);
    assert.equal(scoped.length, 3);
    assert.equal(scoped.filter((template) => template.isDefault).length, 1);
  }
  // Existing edits must survive configure (no silent overwrite).
  const edited = configured.find((t) => t.id === "panek-puglesi-partnership");
  assert.equal(edited?.subject, "Old subject");
  assert.equal(edited?.body, "Old body");
  assert.equal(edited?.sender.endsWith("@sender.example"), true);
  // Missing stock template re-added from original content
  const restored = configured.find((t) => t.id === "modeclean-follow-up");
  assert.ok(restored);
  assert.notEqual(restored.subject, "Old subject");
});

test("modelos 7. relatório One-Click mostra assunto e corpo completos", () => {
  const source = readFileSync(
    new URL("../src/components/outreach/one-click-outreach.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /Assunto completo/);
  assert.match(source, /Corpo completo/);
  assert.match(source, /report\.subject/);
  assert.match(source, /report\.body/);
});
