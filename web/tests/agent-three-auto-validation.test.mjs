import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AGENT_THREE_DNS_INCOMPLETE_MESSAGE,
  validateAgentThreeCampaignLeads,
} from "../src/lib/agent-three-auto-validation.ts";
import {
  createInitialAgentThreeSnapshot,
  getAgentThreeMetrics,
  loadAgentThreeLeads,
  normalizeAgentThreeSnapshot,
  prepareAgentThreeCampaign,
  startAgentThree,
} from "../src/lib/agent-three-queue.ts";
import { validateEmailLocally } from "../src/lib/email-validation.ts";

const createdAt = "2026-07-28T09:00:00.000Z";
const validatedAt = "2026-07-28T09:00:01.000Z";
const preparedAt = "2026-07-28T09:00:02.000Z";

function importedLead(
  id = "imported-lead",
  email = "lead@example.test"
) {
  return {
    id,
    company: "Empresa importada",
    website: "https://example.test",
    email,
    phone: "",
    address: "London",
    category: "Services",
    aiScore: 0,
  };
}

const validDomain = async (domain) => ({
  domain,
  exists: true,
  hasMxRecords: true,
  reason: null,
});

function localValidator(checkDomain) {
  return (email) =>
    validateEmailLocally(email, checkDomain, validatedAt);
}

async function automaticallyPrepare(
  snapshot,
  profileId,
  campaignId,
  leads,
  checkDomain = validDomain,
  options = {}
) {
  const loaded = loadAgentThreeLeads(
    snapshot,
    profileId,
    campaignId,
    leads,
    leads.length,
    createdAt
  );
  const validation = await validateAgentThreeCampaignLeads(
    leads,
    localValidator(checkDomain),
    { ...options, now: () => validatedAt }
  );
  const preparation = prepareAgentThreeCampaign(
    loaded.snapshot,
    profileId,
    campaignId,
    validation.leads,
    preparedAt
  );
  return { loaded, validation, preparation };
}

test("automático 1. lead importado sem metadados é validado no Start", async () => {
  const result = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "pnp-campanha-teste",
    [importedLead()]
  );

  assert.equal(result.validation.validatedCount, 1);
  assert.equal(result.validation.updates.length, 1);
  assert.equal(
    result.preparation.snapshot.operations["panek-puglesi"].queue[0]
      .queueStatus,
    "ready"
  );
});

test("automático 2. sintaxe, domínio e MX válidos viram unknown/mailbox_not_verified", async () => {
  const result = await validateAgentThreeCampaignLeads(
    [importedLead()],
    localValidator(validDomain),
    { now: () => validatedAt }
  );
  const lead = result.leads[0];

  assert.equal(lead.emailValidationStatus, "unknown");
  assert.equal(lead.emailValidationReason, "mailbox_not_verified");
  assert.equal(lead.emailDomain, "example.test");
  assert.equal(lead.hasMxRecords, true);
});

test("automático 3. lead elegível vira ready sem ação manual", async () => {
  const result = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "pnp-campanha-teste",
    [importedLead()]
  );

  assert.equal(result.preparation.eligibleCount, 1);
  assert.equal(result.preparation.preparedCount, 1);
});

test("automático 4. mesmo lead fica elegível separadamente para P&P e Modeclean", async () => {
  const lead = importedLead("shared-lead", "shared@example.test");
  const pnp = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "pnp-campanha-teste",
    [lead]
  );
  const modeclean = await automaticallyPrepare(
    pnp.preparation.snapshot,
    "modeclean",
    "modeclean-campanha-teste",
    [lead]
  );

  assert.equal(
    modeclean.preparation.snapshot.operations["panek-puglesi"].queue[0]
      .queueStatus,
    "ready"
  );
  assert.equal(
    modeclean.preparation.snapshot.operations.modeclean.queue[0].queueStatus,
    "ready"
  );
});

test("automático 5. invalid_syntax é removido da fila ativa", async () => {
  let dnsCalls = 0;
  const result = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "invalid-syntax",
    [importedLead("invalid-syntax", "endereço-inválido")],
    async (domain) => {
      dnsCalls += 1;
      return validDomain(domain);
    }
  );
  const item =
    result.preparation.snapshot.operations["panek-puglesi"].queue[0];

  assert.equal(dnsCalls, 0);
  assert.equal(item.queueStatus, "blocked");
  assert.equal(item.exclusionReason, "invalid_syntax");
  assert.equal(result.validation.invalidCount, 1);
  const metrics = getAgentThreeMetrics(
    result.preparation.snapshot.operations["panek-puglesi"]
  );
  assert.equal(metrics.invalidRemoved, 1);
  assert.equal(metrics.removed, 0);
});

test("automático 6. domain_not_found é removido", async () => {
  const result = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "domain-not-found",
    [importedLead()],
    async (domain) => ({
      domain,
      exists: false,
      hasMxRecords: false,
      reason: "domain_not_found",
    })
  );
  const item =
    result.preparation.snapshot.operations["panek-puglesi"].queue[0];

  assert.equal(item.queueStatus, "blocked");
  assert.equal(item.exclusionReason, "domain_not_found");
});

test("automático 7. no_mx_records é removido", async () => {
  const result = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "no-mx",
    [importedLead()],
    async (domain) => ({
      domain,
      exists: true,
      hasMxRecords: false,
      reason: "no_mx_records",
    })
  );
  const item =
    result.preparation.snapshot.operations["panek-puglesi"].queue[0];

  assert.equal(item.queueStatus, "blocked");
  assert.equal(item.exclusionReason, "no_mx_records");
});

test("automático 8. erro DNS transitório permanece pendente", async () => {
  const result = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "dns-error",
    [importedLead()],
    async (domain) => ({
      domain,
      exists: false,
      hasMxRecords: false,
      reason: "dns_error",
      errorMessage: "DNS temporariamente indisponível",
    })
  );
  const item =
    result.preparation.snapshot.operations["panek-puglesi"].queue[0];

  assert.equal(item.queueStatus, "pending");
  assert.equal(item.validationReason, "dns_error");
  assert.equal(result.validation.dnsErrorCount, 1);
  assert.equal(
    AGENT_THREE_DNS_INCOMPLETE_MESSAGE,
    "Não foi possível concluir a validação DNS."
  );
});

test("automático 9. suppression list bloqueia antes da validação DNS", async () => {
  const lead = importedLead();
  const loaded = loadAgentThreeLeads(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "suppressed",
    [lead],
    1,
    createdAt
  );
  const suppressed = structuredClone(loaded.snapshot);
  const queueItem = suppressed.operations["panek-puglesi"].queue[0];
  queueItem.queueStatus = "blocked";
  queueItem.exclusionReason = "suppressed";
  let validationCalls = 0;
  const validation = await validateAgentThreeCampaignLeads(
    [lead],
    async (email) => {
      validationCalls += 1;
      return localValidator(validDomain)(email);
    },
    { shouldSkip: () => true, now: () => validatedAt }
  );
  const preparation = prepareAgentThreeCampaign(
    suppressed,
    "panek-puglesi",
    "suppressed",
    validation.leads,
    preparedAt
  );

  assert.equal(validationCalls, 0);
  assert.equal(
    preparation.snapshot.operations["panek-puglesi"].queue[0]
      .exclusionReason,
    "suppressed"
  );
});

test("automático 10. envio desativado não chama SMTP", async () => {
  const result = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "protected",
    [importedLead()]
  );
  let smtpCalls = 0;
  const protectedStart = startAgentThree(
    result.preparation.snapshot,
    "panek-puglesi",
    false,
    preparedAt
  );

  assert.equal(smtpCalls, 0);
  assert.equal(protectedStart.started, false);
  assert.equal(
    protectedStart.snapshot.operations["panek-puglesi"].queue[0]
      .queueStatus,
    "ready"
  );
});

test("automático 11. envio desativado não consome limite", async () => {
  const result = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "protected-limit",
    [importedLead()]
  );
  const protectedStart = startAgentThree(
    result.preparation.snapshot,
    "panek-puglesi",
    false,
    preparedAt
  );
  const operation = protectedStart.snapshot.operations["panek-puglesi"];

  assert.equal(operation.queue[0].attemptCount, 0);
  assert.equal(operation.sentIndex.length, 0);
});

test("automático 12. envio desativado não incrementa processados", async () => {
  const result = await automaticallyPrepare(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "protected-counter",
    [importedLead()]
  );
  const protectedStart = startAgentThree(
    result.preparation.snapshot,
    "panek-puglesi",
    false,
    preparedAt
  );

  assert.equal(
    protectedStart.snapshot.operations["panek-puglesi"].processedCount,
    0
  );
});

test("automático 13. nenhum botão novo é necessário", () => {
  const source = readFileSync(
    new URL(
      "../src/components/agents/agent-three-sender.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(source.includes(">Validar<"), false);
  assert.equal(source.includes(">Preparar<"), false);
  assert.equal(source.includes(">Carregar leads<"), false);
  assert.equal(source.includes("runner.loadCampaign"), true);
  assert.equal(source.includes("handleCampaignChange"), true);
});

test("automático 14. Agente 2 continua usando o mesmo validador local", () => {
  const source = readFileSync(
    new URL("../src/hooks/use-agent-two-runner.ts", import.meta.url),
    "utf8"
  );

  assert.equal(
    source.includes("localEmailValidationProvider.validate"),
    true
  );
  assert.equal(source.includes("/api/email-validation/domain"), false);
});

test("automático 15. estado persistido atual migra e recebe validação", async () => {
  const lead = importedLead();
  const loaded = loadAgentThreeLeads(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "persisted-campaign",
    [lead],
    1,
    createdAt
  );
  const restored = normalizeAgentThreeSnapshot(
    structuredClone(loaded.snapshot)
  );
  const validation = await validateAgentThreeCampaignLeads(
    [lead],
    localValidator(validDomain),
    { now: () => validatedAt }
  );
  const prepared = prepareAgentThreeCampaign(
    restored,
    "panek-puglesi",
    "persisted-campaign",
    validation.leads,
    preparedAt
  );

  assert.equal(
    prepared.snapshot.operations["panek-puglesi"].queue[0].queueStatus,
    "ready"
  );
  assert.equal(
    prepared.snapshot.operations["panek-puglesi"].queue[0]
      .validationReason,
    "mailbox_not_verified"
  );
});
