import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bindSignatureToOperation,
  getOperationSignatureMismatch,
  OPERATION_SIGNATURE_MISMATCH_MESSAGE,
  removeLegacyEmbeddedOneClickSignatures,
} from "../src/lib/operation-signature.ts";
import { DEFAULT_SIGNATURE_HTML } from "../src/lib/signature-template.ts";
import {
  buildOneClickCampaignName,
  buildOneClickReport,
  clampOneClickInterval,
  clampOneClickQuantity,
  createEmptyOneClickProgress,
  dedupeLeadsByEmail,
  estimateRemainingMs,
  isOneClickEligibleLead,
  parseOneClickCheckpoint,
  selectOneClickEligibleLeads,
  serializeOneClickCheckpoint,
  shouldSkipResendForConfirmedDelivery,
} from "../src/lib/one-click-outreach.ts";
import {
  evaluateAgentThreeCircuitBreaker,
  AGENT_THREE_CONSECUTIVE_FAILURE_LIMIT,
} from "../src/lib/agent-three-circuit-breaker.ts";
import {
  applyAgentThreeSmtpResult,
} from "../src/lib/agent-three-delivery.ts";
import { shouldSkipSmtpForItem } from "../src/lib/agent-three-reconciliation.ts";
import {
  claimNextAgentThreeItem,
  createInitialAgentThreeSnapshot,
  loadAgentThreeLeads,
  startAgentThree,
} from "../src/lib/agent-three-queue.ts";
import {
  getAgentThreeSmtpAvailability,
  sendAgentThreeSmtp,
  verifyAgentThreeSmtpConnection,
  classifyAgentThreeSmtpError,
} from "../src/lib/server/agent-three-smtp-core.ts";
import { createLeadBatch, stampLeadsWithBatchId, filterLeadsByBatchId } from "../src/lib/lead-batch.ts";
import {
  assessRealSearchResponse,
  REAL_SEARCH_UNAVAILABLE_MESSAGE,
} from "../src/lib/search/live-search-result.ts";

const now = "2026-08-03T12:00:00.000Z";

function lead(id, email, extras = {}) {
  return {
    id,
    company: `Company ${id}`,
    website: `https://${id}.example.test`,
    email,
    phone: "",
    address: "London",
    category: "Property Finance Broker",
    aiScore: 80,
    synthetic: false,
    emailIsGuessed: false,
    emailSourceUrl: email ? `https://${id}.example.test/contact` : null,
    emailDiscoveryMethod: email ? "website_contact" : null,
    ...extras,
  };
}

function smtpEnvironment(overrides = {}) {
  return {
    AGENT3_REAL_SEND_ENABLED: "true",
    AGENT3_SUPPRESSION_LIST: "",
    PNP_SMTP_HOST: "pnp.smtp.example.test",
    PNP_SMTP_PORT: "465",
    PNP_SMTP_SECURE: "true",
    PNP_SMTP_USER: "pnp@example.test",
    PNP_SMTP_APP_PASSWORD: "pnp-test-secret",
    PNP_FROM_NAME: "P&P Test",
    PNP_REPLY_TO: "pnp-reply@example.test",
    MODECLEAN_SMTP_HOST: "modeclean.smtp.example.test",
    MODECLEAN_SMTP_PORT: "587",
    MODECLEAN_SMTP_SECURE: "false",
    MODECLEAN_SMTP_USER: "modeclean@example.test",
    MODECLEAN_SMTP_APP_PASSWORD: "modeclean-test-secret",
    MODECLEAN_FROM_NAME: "Modeclean Test",
    MODECLEAN_REPLY_TO: "modeclean-reply@example.test",
    ...overrides,
  };
}

function readySnapshot(profileId = "panek-puglesi", count = 5) {
  let snapshot = createInitialAgentThreeSnapshot();
  const leads = Array.from({ length: count }, (_, i) =>
    lead(`L${i}`, `user${i}@example.test`, {
      emailValidationStatus: "valid",
      emailValidationReason: "confirmed",
      hasMxRecords: true,
      normalizedEmail: `user${i}@example.test`,
    })
  );
  const loaded = loadAgentThreeLeads(
    snapshot,
    profileId,
    "camp-one-click",
    leads,
    count,
    now
  );
  snapshot = loaded.snapshot;
  const started = startAgentThree(snapshot, profileId, true, now);
  assert.equal(started.started, true);
  return started.snapshot;
}

// ── Batch flow isolation ──────────────────────────────────────────────────

test("one-click 1. fluxo completo isola batchId", () => {
  const batchA = createLeadBatch({
    sector: "Property Finance Broker",
    location: "London",
    foundCount: 3,
  });
  const batchB = createLeadBatch({
    sector: "Cleaning",
    location: "Manchester",
    foundCount: 2,
  });
  assert.notEqual(batchA.batchId, batchB.batchId);

  const leadsA = stampLeadsWithBatchId(
    [lead("a1", "a@ex.test"), lead("a2", "b@ex.test"), lead("a3", null)],
    batchA.batchId
  );
  const leadsB = stampLeadsWithBatchId(
    [lead("b1", "c@ex.test"), lead("b2", "d@ex.test")],
    batchB.batchId
  );
  const mixed = [...leadsA, ...leadsB];
  assert.equal(filterLeadsByBatchId(mixed, batchA.batchId).length, 3);
  assert.equal(filterLeadsByBatchId(mixed, batchB.batchId).length, 2);
  assert.equal(
    filterLeadsByBatchId(mixed, batchA.batchId).every(
      (l) => l.batchId === batchA.batchId
    ),
    true
  );
});

test("one-click 2. dedupe e elegíveis (unknown mailbox válida)", () => {
  const leads = [
    lead("1", "ok@ex.test", {
      emailValidationStatus: "valid",
      emailValidationReason: "confirmed",
      hasMxRecords: true,
    }),
    lead("2", "OK@ex.test", {
      emailValidationStatus: "valid",
      emailValidationReason: "confirmed",
      hasMxRecords: true,
    }),
    lead("3", "unk@ex.test", {
      emailValidationStatus: "unknown",
      emailValidationReason: "mailbox_not_verified",
      hasMxRecords: true,
    }),
    lead("4", "bad@ex.test", {
      emailValidationStatus: "invalid",
      emailValidationReason: "invalid_syntax",
    }),
    lead("5", null),
  ];
  const { leads: unique, duplicatesRemoved } = dedupeLeadsByEmail(leads);
  assert.equal(duplicatesRemoved, 1);
  assert.equal(unique.length, 4);
  const eligible = selectOneClickEligibleLeads(unique);
  assert.equal(eligible.length, 2);
  assert.equal(isOneClickEligibleLead(leads[2]), true);
  assert.equal(isOneClickEligibleLead(leads[3]), false);
});

test("one-click 3. nome de campanha e relatório final consistente", () => {
  assert.equal(
    buildOneClickCampaignName("Property Finance Broker", "London"),
    "Property Finance Broker · London"
  );
  const progress = {
    ...createEmptyOneClickProgress(),
    stage: "completed",
    batchId: "batch-x",
    campaignId: "camp-x",
    foundCount: 10,
    withWebsiteCount: 8,
    withEmailCount: 6,
    eligibleCount: 5,
    duplicatesRemoved: 1,
    withoutEmailCount: 4,
    sentCount: 5,
    failedCount: 0,
    elapsedMs: 12_000,
  };
  const report = buildOneClickReport({
    config: {
      operation: "panek-puglesi",
      sector: "Property Finance Broker",
      location: "London",
      quantity: 10,
      templateId: "partnership",
      templateKind: "preset",
      minIntervalSeconds: 3,
      maxIntervalSeconds: 8,
    },
    progress,
  });
  assert.equal(report.completed, true);
  assert.equal(report.sentCount, 5);
  assert.equal(report.foundCount, 10);
  assert.equal(report.duplicatesRemoved, 1);
  assert.equal(report.durationMs, 12_000);
});

// ── SMTP preflight / circuit breaker ──────────────────────────────────────

test("one-click 4. SMTP indisponível (config) interrompe antes do envio", () => {
  const result = getAgentThreeSmtpAvailability("panek-puglesi", {
    AGENT3_REAL_SEND_ENABLED: "true",
  });
  assert.equal(result.status, "configuration_error");
});

test("one-click 5. SMTP real_send_disabled interrompe preflight", () => {
  const result = getAgentThreeSmtpAvailability(
    "panek-puglesi",
    smtpEnvironment({ AGENT3_REAL_SEND_ENABLED: "false" })
  );
  assert.equal(result.status, "real_send_disabled");
});

test("one-click 6. verify SMTP falha de auth sem enviar mensagem", async () => {
  let mailCalls = 0;
  const result = await verifyAgentThreeSmtpConnection("panek-puglesi", {
    environment: smtpEnvironment(),
    createTransport() {
      return {
        async sendMail() {
          mailCalls += 1;
          return { messageId: "should-not-send" };
        },
        async verify() {
          const err = new Error("Invalid login");
          err.code = "EAUTH";
          err.responseCode = 535;
          throw err;
        },
      };
    },
  });
  assert.equal(result.status, "authentication_error");
  assert.equal(mailCalls, 0);
});

test("one-click 7. ECONNREFUSED é falha de conexão", () => {
  assert.equal(
    classifyAgentThreeSmtpError({ code: "ECONNREFUSED" }),
    "connection_error"
  );
});

test("SMTP 535/5.7.x é AUTH permanente", () => {
  assert.equal(
    classifyAgentThreeSmtpError({
      code: "EAUTH",
      responseCode: 535,
      command: "AUTH PLAIN",
      response: "535 5.7.8 Username and Password not accepted",
    }),
    "authentication_error"
  );
});

test("SMTP 454/4xx EAUTH é AUTH transitório, não senha errada", () => {
  assert.equal(
    classifyAgentThreeSmtpError({
      code: "EAUTH",
      responseCode: 454,
      command: "AUTH PLAIN",
      response: "454 4.7.0 Too many login attempts, please try again later",
    }),
    "auth_transient"
  );
});

test("SMTP timeout é CONNECTION_ERROR", () => {
  const timeout = new Error("Timeout de sendMail após 45000ms.");
  timeout.name = "AgentThreeTimeoutError";
  assert.equal(classifyAgentThreeSmtpError(timeout), "connection_error");
  assert.equal(
    classifyAgentThreeSmtpError({ code: "ETIMEDOUT" }),
    "connection_error"
  );
});

test("SMTP sent sem providerMessageId não confirma", async () => {
  const result = await sendAgentThreeSmtp(
    {
      operation: "panek-puglesi",
      recipient: "info@londonmediclab.com",
      subject: "S",
      html: "<p>x</p>",
    },
    {
      environment: smtpEnvironment(),
      createTransport() {
        return {
          async sendMail() {
            return {};
          },
        };
      },
    }
  );
  assert.equal(result.status, "reconciliation_required");
  assert.equal(result.messageId, undefined);
});

test("SMTP falha devolve code/responseCode/response/command/classification", async () => {
  const result = await sendAgentThreeSmtp(
    {
      operation: "panek-puglesi",
      recipient: "info@londonmediclab.com",
      subject: "S",
      html: "<p>x</p>",
    },
    {
      environment: smtpEnvironment(),
      createTransport() {
        return {
          async sendMail() {
            const err = new Error("Invalid login");
            err.code = "EAUTH";
            err.responseCode = 454;
            err.command = "AUTH PLAIN";
            err.response =
              "454 4.7.0 Too many login attempts, please try again later";
            throw err;
          },
        };
      },
    }
  );
  assert.equal(result.status, "auth_transient");
  assert.equal(result.smtp?.code, "EAUTH");
  assert.equal(result.smtp?.responseCode, 454);
  assert.equal(result.smtp?.command, "AUTH PLAIN");
  assert.match(result.smtp?.response ?? "", /454 4\.7\.0 Too many login attempts/);
  assert.equal(result.smtp?.classification, "auth_transient");
});

test("confirmed providerMessageId nunca é reenviado", () => {
  const item = {
    id: "queue-confirmed",
    leadId: "serp-ChIJzyT0IhMPdkgRy3KZOrzKBrI",
    campaignId: "camp-1788363227529",
    campaignProfileId: "panek-puglesi",
    normalizedEmail: "clinic@lindafiumara.com",
    originalEmail: "clinic@lindafiumara.com",
    queueStatus: "sent",
    providerMessageId: "<1d4490fc-7b02-5d47-34da-a32abd4b0e74@gmail.com>",
  };
  const skip = shouldSkipSmtpForItem(item, [
    {
      campaignId: "camp-1788363227529",
      leadId: item.leadId,
      email: item.normalizedEmail,
      operation: "panek-puglesi",
      queueItemId: item.id,
      providerMessageId: item.providerMessageId,
      confirmedAt: "2026-09-02T17:53:53.474Z",
      status: "confirmed",
    },
  ]);
  assert.ok(skip?.providerMessageId);
  assert.equal(shouldSkipResendForConfirmedDelivery(item.providerMessageId), true);
});

test("one-click 8. primeiro envio com provedor indisponível pausa imediatamente", () => {
  const snapshot = readySnapshot("panek-puglesi", 5);
  const claimed = claimNextAgentThreeItem(snapshot, "panek-puglesi", now);
  assert.ok(claimed.item);
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    { status: "transient_error", message: "Falha temporária no envio." },
    now
  );
  assert.equal(applied.shouldPause, true);
  assert.equal(applied.isSystemic, true);
  assert.match(applied.stopReason ?? "", /indisponível|provedor/i);
  assert.equal(
    applied.snapshot.operations["panek-puglesi"].status,
    "paused"
  );
  // Remaining recipients stay ready — not mass-failed
  const readyLeft = applied.snapshot.operations["panek-puglesi"].queue.filter(
    (q) => q.queueStatus === "ready"
  ).length;
  assert.ok(readyLeft >= 3);
});

test("one-click 9. 3 falhas iguais interrompem a execução", () => {
  let snapshot = readySnapshot("panek-puglesi", 10);
  for (let i = 0; i < AGENT_THREE_CONSECUTIVE_FAILURE_LIMIT; i++) {
    const claimed = claimNextAgentThreeItem(
      snapshot,
      "panek-puglesi",
      now
    );
    assert.ok(claimed.item);
    // After first pause would stop — for permanent_error after some success path:
    // Use permanent_error which is not systemic on first if we already had sends...
    // Actually first permanent is not systemic. Simulate 3 permanent.
    const applied = applyAgentThreeSmtpResult(
      claimed.snapshot,
      "panek-puglesi",
      claimed.item.id,
      { status: "permanent_error", message: "Falha permanente no envio." },
      now
    );
    snapshot = applied.snapshot;
    if (i < AGENT_THREE_CONSECUTIVE_FAILURE_LIMIT - 1) {
      assert.equal(applied.shouldPause, false);
      // Restart running if needed for next claim — permanent leaves running
      assert.equal(
        snapshot.operations["panek-puglesi"].status,
        "running"
      );
    } else {
      assert.equal(applied.shouldPause, true);
      assert.match(applied.stopReason ?? "", /3 falhas consecutivas/i);
      assert.equal(
        snapshot.operations["panek-puglesi"].status,
        "paused"
      );
    }
  }
});

test("one-click 10. authentication_error é sistêmica e pausa", () => {
  const decision = evaluateAgentThreeCircuitBreaker({
    smtpStatus: "authentication_error",
    consecutiveFailureStatus: null,
    consecutiveFailureCount: 0,
    confirmedSendCount: 0,
    isFirstSendAttempt: true,
  });
  assert.equal(decision.shouldPause, true);
  assert.equal(decision.isSystemic, true);
});

test("one-click 11. campanha com providerMessageId não repete envio", () => {
  assert.equal(shouldSkipResendForConfirmedDelivery("msg-abc-12345"), true);
  assert.equal(shouldSkipResendForConfirmedDelivery("sim-123"), false);
  assert.equal(shouldSkipResendForConfirmedDelivery(null), false);
  assert.equal(shouldSkipResendForConfirmedDelivery(""), false);

  // loadLeads path: already sent with real id stays out of ready via queue logic
  let snapshot = createInitialAgentThreeSnapshot();
  const leads = [
    lead("1", "a@ex.test", {
      emailValidationStatus: "valid",
      emailValidationReason: "confirmed",
      hasMxRecords: true,
      normalizedEmail: "a@ex.test",
    }),
    lead("2", "b@ex.test", {
      emailValidationStatus: "valid",
      emailValidationReason: "confirmed",
      hasMxRecords: true,
      normalizedEmail: "b@ex.test",
    }),
  ];
  const loaded = loadAgentThreeLeads(
    snapshot,
    "panek-puglesi",
    "camp-done",
    leads,
    2,
    now
  );
  snapshot = loaded.snapshot;
  // Mark first as sent with real message id
  const op = snapshot.operations["panek-puglesi"];
  const first = op.queue[0];
  snapshot = {
    ...snapshot,
    operations: {
      ...snapshot.operations,
      "panek-puglesi": {
        ...op,
        queue: op.queue.map((item, idx) =>
          idx === 0
            ? {
                ...item,
                queueStatus: "sent",
                providerMessageId: "<real-smtp-id@mail>",
                sentAt: now,
              }
            : item
        ),
        sentIndex: [
          {
            queueItemId: first.id,
            leadId: first.leadId,
            normalizedEmail: first.normalizedEmail,
            campaignProfileId: "panek-puglesi",
            campaignId: "camp-done",
            sentAt: now,
            providerMessageId: "<real-smtp-id@mail>",
          },
        ],
      },
    },
  };
  // Reload same leads — already sent must not re-enter as new ready duplicates
  const reloaded = loadAgentThreeLeads(
    snapshot,
    "panek-puglesi",
    "camp-done",
    leads,
    2,
    now
  );
  const sent = reloaded.snapshot.operations["panek-puglesi"].queue.filter(
    (q) => q.queueStatus === "sent" && q.providerMessageId
  );
  assert.ok(sent.length >= 1);
  assert.ok(
    sent.every((s) => shouldSkipResendForConfirmedDelivery(s.providerMessageId))
  );
});

// ── Pause / Stop / Resume / reload ────────────────────────────────────────

test("one-click 12. checkpoint serializa e parseia (reload não perde lote)", () => {
  const checkpoint = {
    version: 1,
    config: {
      operation: "panek-puglesi",
      sector: "Property Finance Broker",
      location: "London",
      quantity: 50,
      templateId: "partnership",
      templateKind: "preset",
      minIntervalSeconds: 3,
      maxIntervalSeconds: 8,
    },
    batchId: "batch-property-finance-broker-london",
    campaignId: "camp-123",
    stage: "sending",
    leadIds: ["a", "b"],
    eligibleLeadIds: ["a"],
    duplicatesRemoved: 2,
    foundCount: 50,
    withWebsiteCount: 40,
    withEmailCount: 30,
    withoutEmailCount: 20,
    startedAt: now,
    control: "paused",
    stopReason: null,
  };
  const raw = serializeOneClickCheckpoint(checkpoint);
  const parsed = parseOneClickCheckpoint(raw);
  assert.ok(parsed);
  assert.equal(parsed.batchId, checkpoint.batchId);
  assert.equal(parsed.campaignId, "camp-123");
  assert.equal(parsed.config.operation, "panek-puglesi");
  assert.equal(parseOneClickCheckpoint("not-json"), null);
});

test("one-click 13. Pause/Stop/Resume no circuit breaker e intervalos", () => {
  const paused = evaluateAgentThreeCircuitBreaker({
    smtpStatus: "sent",
    consecutiveFailureStatus: "permanent_error",
    consecutiveFailureCount: 2,
    confirmedSendCount: 1,
    isFirstSendAttempt: false,
  });
  assert.equal(paused.consecutiveFailureCount, 0);
  assert.equal(paused.shouldPause, false);

  const intervals = clampOneClickInterval(8, 3);
  assert.equal(intervals.minIntervalSeconds, 8);
  assert.equal(intervals.maxIntervalSeconds, 8);
  assert.equal(clampOneClickQuantity(999), 200);
  assert.equal(clampOneClickQuantity(0), 1);
});

test("one-click 14. P&P e Modeclean isolados no SMTP", async () => {
  const calls = [];
  const mock = {
    environment: smtpEnvironment(),
    createTransport(options) {
      calls.push(options.auth.user);
      return {
        async sendMail() {
          return { messageId: "msg-iso" };
        },
      };
    },
  };
  await sendAgentThreeSmtp(
    {
      operation: "panek-puglesi",
      recipient: "a@example.test",
      subject: "S",
      html: "<p>x</p>",
    },
    mock
  );
  await sendAgentThreeSmtp(
    {
      operation: "modeclean",
      recipient: "b@example.test",
      subject: "S",
      html: "<p>x</p>",
    },
    mock
  );
  assert.deepEqual(calls, ["pnp@example.test", "modeclean@example.test"]);
});

test("one-click 15. estimativa de tempo restante", () => {
  const remaining = estimateRemainingMs({
    sentCount: 2,
    failedCount: 0,
    totalRecipients: 10,
    elapsedMs: 10_000,
    minIntervalSeconds: 3,
    maxIntervalSeconds: 3,
  });
  assert.ok(remaining > 0);
  assert.equal(
    estimateRemainingMs({
      sentCount: 10,
      failedCount: 0,
      totalRecipients: 10,
      elapsedMs: 1000,
      minIntervalSeconds: 1,
      maxIntervalSeconds: 1,
    }),
    0
  );
});

test("one-click 16. fonte do componente não usa simulateSend", () => {
  const source = readFileSync(
    new URL("../src/components/outreach/one-click-outreach.tsx", import.meta.url),
    "utf8"
  );
  const hook = readFileSync(
    new URL("../src/hooks/use-one-click-outreach.ts", import.meta.url),
    "utf8"
  );
  assert.equal(/simulateSend/.test(source), false);
  assert.equal(/simulateSend/.test(hook), false);
  assert.match(hook, /agentThree\.start|useAgentThreeRunner/);
  assert.match(hook, /verify:\s*true/);
  assert.match(source, /Iniciar Campanha Completa/);
  assert.match(source, /Pause/);
  assert.match(source, /Stop/);
});

test("one-click 17. delivery application expõe stopReason", () => {
  const snapshot = readySnapshot("modeclean", 3);
  const claimed = claimNextAgentThreeItem(snapshot, "modeclean", now);
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "modeclean",
    claimed.item.id,
    { status: "authentication_error", message: "Erro de autenticação." },
    now
  );
  assert.equal(applied.shouldPause, true);
  assert.ok(applied.stopReason);
  assert.equal(applied.snapshot.operations.modeclean.status, "paused");
  // P&P untouched
  assert.equal(
    applied.snapshot.operations["panek-puglesi"].status,
    "idle"
  );
});

test("one-click 18. fallback offline com zero leads não é sucesso", () => {
  const assessment = assessRealSearchResponse({
    isLive: false,
    source: "autonomous-offline-fallback",
    leads: [],
  });
  assert.equal(assessment.available, false);
  assert.equal(
    REAL_SEARCH_UNAVAILABLE_MESSAGE,
    "Busca real indisponível — nenhum envio iniciado."
  );
});

test("one-click 19. resposta real com empresas pode avançar", () => {
  const assessment = assessRealSearchResponse({
    isLive: true,
    source: "serpapi-equilibrium",
    leads: [lead("real", null)],
  });
  assert.deepEqual(assessment, { available: true, reason: null });
});

test("one-click 19b. fallback SerpAPI live nunca avança o modo estrito", () => {
  for (const source of [
    "serpapi-no-key-autonomous-live",
    "serpapi-empty-autonomous-live",
    "serpapi-quota-autonomous-live",
    "serpapi-equilibrium-supplemented",
  ]) {
    const assessment = assessRealSearchResponse({
      isLive: true,
      source,
      leads: [lead("fallback", null)],
    });
    assert.equal(assessment.available, false, source);
  }
});

test("one-click 20. lote nasce somente depois da busca real limitada", () => {
  const hook = readFileSync(
    new URL("../src/hooks/use-one-click-outreach.ts", import.meta.url),
    "utf8"
  );
  const route = readFileSync(
    new URL("../src/app/api/search/route.ts", import.meta.url),
    "utf8"
  );
  const serpApi = readFileSync(
    new URL("../src/lib/search/providers/serpapi.ts", import.meta.url),
    "utf8"
  );
  assert.equal(/createLeadBatch/.test(hook), false);
  assert.match(hook, /requireLiveResults:\s*true/);
  assert.match(hook, /maxResultsOverride:\s*config\.quantity/);
  assert.match(hook, /getSharedLeadBatchId/);
  assert.match(route, /strictMaxResults === true/);
  assert.match(serpApi, /strictMaxResults\s*\?\s*1/);
});

test("one-click 21. assinatura oficial fica vinculada à operação SMTP", () => {
  const modeclean = bindSignatureToOperation("modeclean", {
    enabled: true,
    body: "<table><tr><td>Modeclean oficial atual</td></tr></table>",
  });
  assert.equal(modeclean.operation, "modeclean");
  assert.equal(getOperationSignatureMismatch("modeclean", modeclean), null);
  assert.equal(
    getOperationSignatureMismatch("panek-puglesi", modeclean),
    OPERATION_SIGNATURE_MISMATCH_MESSAGE
  );
});

test("one-click 22. remove somente assinatura legacy exata do template", () => {
  const legitimateBody =
    "<p>Proposta legítima para {{company}}</p><p>Kind regards,<br>Modeclean</p>";
  const embedded = `<section>${legitimateBody}${DEFAULT_SIGNATURE_HTML}</section>`;
  const cleaned = removeLegacyEmbeddedOneClickSignatures(embedded);

  assert.equal(cleaned.body, `<section>${legitimateBody}</section>`);
  assert.deepEqual(cleaned.removedOperations, ["panek-puglesi"]);

  const userAuthored = `${legitimateBody}<p>Panek &amp; Pugliesi</p>`;
  assert.deepEqual(removeLegacyEmbeddedOneClickSignatures(userAuthored), {
    body: userAuthored,
    removedOperations: [],
  });
});

test("one-click 23. fluxo lê assinatura oficial e a envia na campanha", () => {
  const hook = readFileSync(
    new URL("../src/hooks/use-one-click-outreach.ts", import.meta.url),
    "utf8"
  );
  assert.match(hook, /useOperationSignatureStore\.getState\(\)\.getSignature/);
  assert.match(hook, /signature:\s*bindSignatureToOperation/);
  assert.match(hook, /removeLegacyEmbeddedOneClickSignatures/);
});
