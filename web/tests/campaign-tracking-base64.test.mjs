import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decodeUtf8Base64Url,
  encodeUtf8Base64Url,
} from "../src/lib/base64-url.ts";
import {
  decodeTrackingToken,
  encodeTrackingToken,
  injectEmailTracking,
} from "../src/lib/campaign-tracking.ts";
import {
  AGENT_THREE_TRACKING_ERROR_MESSAGE,
  buildAgentThreeSendRequest,
} from "../src/lib/agent-three-send-request.ts";

function trackingPayload(campaignId) {
  return {
    campaignId,
    leadId: "lead-ação-1",
    email: "contato@empresa.test",
  };
}

function campaign(profileId) {
  return {
    id: `${profileId}-campanha-teste`,
    campaignProfileId: profileId,
    name: "Campanha Teste",
    subject: "Olá, {{company}}",
    body: "<p>Proposta para {{company}}</p>",
    unsubscribeLink: "https://example.test/unsubscribe?email={{email}}",
    signature: {
      enabled: true,
      body: "<p>Equipe {{company}}</p>",
      operation: profileId,
    },
    attachment: null,
  };
}

function queueItem(profileId) {
  return {
    id: `${profileId}-queue-1`,
    leadId: "lead-ação-1",
    campaignProfileId: profileId,
    campaignId: `${profileId}-campanha-teste`,
    companyName: "Empresa Ação",
    originalEmail: "contato@empresa.test",
    normalizedEmail: "contato@empresa.test",
    sector: "Serviços",
    location: "São Paulo",
    validationStatus: "unknown",
    validationReason: "mailbox_not_verified",
    queueStatus: "ready",
    createdAt: "2026-07-28T09:00:00.000Z",
    updatedAt: "2026-07-28T09:00:00.000Z",
    attemptCount: 0,
  };
}

const lead = {
  id: "lead-ação-1",
  company: "Empresa Ação",
  website: "https://empresa.test",
  email: "contato@empresa.test",
  phone: "",
  address: "São Paulo",
  category: "Serviços",
  aiScore: 0,
};

test("base64 1. codifica texto ASCII", () => {
  assert.equal(encodeUtf8Base64Url("hello"), "aGVsbG8");
});

test("base64 2. preserva texto com acentos", () => {
  const value = "Ação, Pugliese e informação";
  assert.equal(decodeUtf8Base64Url(encodeUtf8Base64Url(value)), value);
});

test("base64 3. preserva texto com símbolos", () => {
  const value = "P&P / Modeclean + £50 = ✓";
  assert.equal(decodeUtf8Base64Url(encodeUtf8Base64Url(value)), value);
});

test("base64 4. saída não contém caracteres incompatíveis com URL", () => {
  const token = encodeUtf8Base64Url("símbolos + / = ? &");
  assert.equal(/[+/=]/.test(token), false);
});

test("base64 5. encode e decode fazem round-trip UTF-8", () => {
  const values = ["", "ASCII", "Olá, mundo!", "日本語 🌍"];
  for (const value of values) {
    assert.equal(decodeUtf8Base64Url(encodeUtf8Base64Url(value)), value);
  }
});

test("base64 6. token de P&P é válido", () => {
  const payload = trackingPayload("panek-puglesi-campanha-teste");
  assert.deepEqual(
    decodeTrackingToken(encodeTrackingToken(payload)),
    payload
  );
});

test("base64 7. token de Modeclean é válido", () => {
  const payload = trackingPayload("modeclean-campanha-teste");
  assert.deepEqual(
    decodeTrackingToken(encodeTrackingToken(payload)),
    payload
  );
});

test("base64 8. injectEmailTracking não lança exceção", () => {
  assert.doesNotThrow(() => {
    const html = injectEmailTracking(
      '<p>Olá</p><a href="https://empresa.test">Site</a>',
      trackingPayload("panek-puglesi-campanha-teste")
    );
    assert.equal(html.includes("/api/track/click"), true);
    assert.equal(html.includes("/api/track/open"), true);
  });
});

test("base64 9. construção do pedido funciona com APIs disponíveis no client", () => {
  const codecSource = readFileSync(
    new URL("../src/lib/base64-url.ts", import.meta.url),
    "utf8"
  );
  const result = buildAgentThreeSendRequest(
    "panek-puglesi",
    campaign("panek-puglesi"),
    queueItem("panek-puglesi"),
    lead
  );

  assert.equal(codecSource.includes("Buffer"), false);
  assert.equal(result.errorMessage, null);
  assert.equal(result.request?.recipient, "contato@empresa.test");
  assert.equal(result.request?.subject, "Olá, Empresa Ação");
  assert.equal(result.request?.html?.includes("/api/track/open"), true);
});

test("base64 10. envio desativado retorna antes de qualquer chamada SMTP", () => {
  const source = readFileSync(
    new URL("../src/hooks/use-agent-three-runner.ts", import.meta.url),
    "utf8"
  );
  const startFunction = source.slice(
    source.indexOf("async function start("),
    source.indexOf("function pause(")
  );

  assert.equal(
    startFunction.includes('availability.status !== "connected"'),
    true
  );
  assert.equal(
    startFunction.includes("requestAgentThreeSmtpSend"),
    false
  );
});

test("base64 11. erro controlado não inclui credenciais", () => {
  const result = buildAgentThreeSendRequest(
    "modeclean",
    campaign("modeclean"),
    queueItem("modeclean"),
    lead,
    {
      injectTracking: () => {
        throw new Error("Falha interna");
      },
    }
  );

  assert.equal(result.request, null);
  assert.equal(result.errorMessage, AGENT_THREE_TRACKING_ERROR_MESSAGE);
  assert.equal(/password|senha|credential/i.test(result.errorMessage ?? ""), false);
});

test("base64 12. token inválido retorna erro controlado", () => {
  assert.equal(decodeUtf8Base64Url("a"), null);
  assert.equal(decodeUtf8Base64Url("inválido"), null);
  assert.equal(decodeTrackingToken("%%%"), null);
});

test("base64 13. bloqueia SMTP Modeclean com assinatura vinculada a P&P", () => {
  const mismatched = campaign("modeclean");
  mismatched.signature.operation = "panek-puglesi";

  const result = buildAgentThreeSendRequest(
    "modeclean",
    mismatched,
    queueItem("modeclean"),
    lead
  );

  assert.equal(result.request, null);
  assert.match(result.errorMessage ?? "", /assinatura/i);
});

test("base64 14. assinatura oficial vazia bloqueia antes do SMTP", () => {
  const unsigned = campaign("panek-puglesi");
  unsigned.signature.body = "";

  const result = buildAgentThreeSendRequest(
    "panek-puglesi",
    unsigned,
    queueItem("panek-puglesi"),
    lead
  );

  assert.equal(result.request, null);
  assert.match(result.errorMessage ?? "", /Assinatura não configurada/);
});
