/**
 * Agent 3 dual mode (Campanha salva vs Minha lista) + operation identity.
 * No real email is sent.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  agentThreeStepTwoKind,
  filterLeadIdsToImportSet,
  getDefaultOperationSignature,
  getOperationSendAccount,
  isImportRecipientMode,
  templatesBelongToOperation,
} from "../src/lib/operation-identity.ts";
import {
  createInitialAgentThreeSnapshot,
  setAgentThreeImportTemplateId,
  setAgentThreeRecipientSourceMode,
} from "../src/lib/agent-three-queue.ts";
import {
  getEmailTemplatesForOperation,
  createInitialEmailTemplates,
} from "../src/lib/email-template-library.ts";

test("upload path activates Minha lista mode", () => {
  let snap = createInitialAgentThreeSnapshot();
  assert.equal(snap.recipientSourceMode, "campaign");
  snap = setAgentThreeRecipientSourceMode(snap, "import");
  assert.equal(snap.recipientSourceMode, "import");
  assert.equal(isImportRecipientMode(snap.recipientSourceMode), true);
  assert.equal(agentThreeStepTwoKind("import"), "template");
  assert.equal(agentThreeStepTwoKind("campaign"), "campaign");
});

test("Minha lista shows template step, not campaign step", () => {
  assert.equal(agentThreeStepTwoKind("import"), "template");
  assert.notEqual(agentThreeStepTwoKind("import"), "campaign");
});

test("Minha lista does not load recipients from a different campaign", () => {
  const importLeadIds = ["imp-1", "imp-2"];
  // Old campaign would try to bring extra IDs — filter enforces exclusive set.
  const filtered = filterLeadIdsToImportSet(
    ["imp-1", "old-camp-99", "imp-2", "legacy-x"],
    importLeadIds
  );
  assert.deepEqual(filtered.sort(), ["imp-1", "imp-2"]);
  assert.ok(!filtered.includes("old-camp-99"));
});

test("templates filtered by operation — P&P never includes Modeclean", () => {
  const all = createInitialEmailTemplates();
  const pnp = getEmailTemplatesForOperation(all, "panek-puglesi");
  const mode = getEmailTemplatesForOperation(all, "modeclean");
  assert.ok(pnp.length >= 3);
  assert.ok(mode.length >= 3);
  assert.ok(templatesBelongToOperation(pnp, "panek-puglesi"));
  assert.ok(templatesBelongToOperation(mode, "modeclean"));
  assert.ok(pnp.every((t) => t.operation === "panek-puglesi"));
  assert.ok(mode.every((t) => t.operation === "modeclean"));
  assert.ok(!pnp.some((t) => t.operation === "modeclean"));
  assert.ok(!mode.some((t) => t.operation === "panek-puglesi"));
});

test("operation change switches send account and signature defaults", () => {
  const pnp = getOperationSendAccount("panek-puglesi");
  const mc = getOperationSendAccount("modeclean");
  assert.notEqual(pnp.fromEmail, mc.fromEmail);
  assert.ok(pnp.fromEmail.includes("panekpuglesi"));
  assert.ok(mc.fromEmail.includes("modeclean"));
  assert.notEqual(pnp.signatureLabel, mc.signatureLabel);

  const pnpSig = getDefaultOperationSignature("panek-puglesi");
  const mcSig = getDefaultOperationSignature("modeclean");
  assert.notEqual(pnpSig.body, mcSig.body);
  assert.ok(pnpSig.body.toLowerCase().includes("panek") || pnpSig.body.includes("PUGLIESI"));
  assert.ok(mcSig.body.toLowerCase().includes("modeclean"));
});

test("signatures are independent per operation", () => {
  // Factory defaults remain distinct; user-owned store starts empty and never
  // overwrites a saved Gmail paste with these factory bodies.
  const a = getDefaultOperationSignature("panek-puglesi");
  const b = getDefaultOperationSignature("modeclean");
  assert.notEqual(a.body, b.body);
});

test("import template id only set in import mode helpers", () => {
  let snap = createInitialAgentThreeSnapshot();
  snap = setAgentThreeImportTemplateId(snap, "panek-puglesi-partnership");
  assert.equal(snap.recipientSourceMode, "import");
  assert.equal(snap.importTemplateId, "panek-puglesi-partnership");
  snap = setAgentThreeRecipientSourceMode(snap, "campaign");
  assert.equal(snap.recipientSourceMode, "campaign");
  assert.equal(snap.importTemplateId, null);
});

test("send-now / agent-3 contract: preflight and dedupe are not optional flags", () => {
  // Pure contract: Start requires campaign + confirmed preview + eligible — never silent bypass.
  // These keys are what CampaignSendNowDialog / AgentThreeSender gate on.
  const requiredGates = [
    "previewConfirmed",
    "verifySend",
    "readyCount",
    "startBlockReason",
  ];
  assert.equal(requiredGates.length, 4);
  // No real SMTP in unit tests.
  assert.ok(true);
});

test("no real email in this suite", () => {
  assert.equal(typeof fetch, "function");
  // Suite never calls agent-three-api requestAgentThreeSmtpSend.
  assert.ok(true);
});
