import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDatabaseAdapter } from "../src/lib/server/local-database.ts";
import { executeAgentThreeSendWithLease } from "../src/lib/server/agent-three-send-pipeline.ts";
import { buildSendLeaseKey } from "../src/lib/send-lease.ts";
import { assertNoCommercialDatabaseAccess } from "./helpers/commercial-database-guard.mjs";

assertNoCommercialDatabaseAccess(import.meta.url);

const SMTP_ENV = {
  AGENT3_REAL_SEND_ENABLED: "true",
  PNP_SMTP_HOST: "smtp.example.test",
  PNP_SMTP_PORT: "587",
  PNP_SMTP_SECURE: "false",
  PNP_SMTP_USER: "sender@example.test",
  PNP_SMTP_APP_PASSWORD: "not-used-in-mock",
  PNP_FROM_NAME: "P&P",
  PNP_REPLY_TO: "sender@example.test",
};

function request(overrides = {}) {
  return {
    operation: "panek-puglesi",
    recipient: "clinic@example.test",
    subject: "Hello",
    html: "<p>Body</p>",
    ownerId: "owner-a",
    campaignId: "camp-1",
    leadId: "lead-1",
    queueItemId: "queue-1",
    contactKind: "first_contact",
    ...overrides,
  };
}

function fixture(nowFn) {
  const root = mkdtempSync(join(tmpdir(), "pnp-send-lease-"));
  const options = {
    databasePath: join(root, "data", "fixture.sqlite"),
    backupDirectory: join(root, "backups"),
    allowVercel: true,
    ...(nowFn ? { now: nowFn } : {}),
  };
  const a = new LocalDatabaseAdapter(options);
  const b = new LocalDatabaseAdapter(options);
  return {
    root,
    a,
    b,
    close() {
      try { a.close(); } catch {}
      try { b.close(); } catch {}
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function countingTransport() {
  let smtpCalls = 0;
  return {
    get calls() {
      return smtpCalls;
    },
    createTransport() {
      return {
        async sendMail() {
          smtpCalls += 1;
          return { messageId: "<msgid.real@smtp.example.test>" };
        },
      };
    },
  };
}

test("A: dois processos disputam o mesmo recipient — só um obtém lease", () => {
  const fx = fixture();
  try {
    const first = fx.a.claimSendLease(request({ ownerId: "proc-1" }));
    const second = fx.b.claimSendLease(request({ ownerId: "proc-2" }));
    assert.equal(first.decision, "claimed");
    assert.equal(second.decision, "already_claimed");
    assert.equal(second.existingMessageId, undefined);
    const sameOwner = fx.b.claimSendLease(request({ ownerId: "proc-1" }));
    assert.equal(sameOwner.decision, "already_claimed");
  } finally {
    fx.close();
  }
});

test("B: segundo worker nunca chama SMTP", async () => {
  const fx = fixture();
  const transport = countingTransport();
  try {
    const held = fx.a.claimSendLease(request({ ownerId: "proc-1" }));
    assert.equal(held.decision, "claimed");
    const second = await executeAgentThreeSendWithLease(
      request({ ownerId: "proc-2" }),
      {
        environment: SMTP_ENV,
        createTransport: transport.createTransport,
        database: fx.b,
      }
    );
    assert.equal(second.status, "already_claimed");
    assert.equal(transport.calls, 0);
  } finally {
    fx.close();
  }
});

test("C: SMTP sucesso + persistência falha vira reconciliation_required, sem retry", async () => {
  const fx = fixture();
  const transport = countingTransport();
  const wrapped = {
    claimSendLease: (input) => fx.a.claimSendLease(input),
    isSuppressed: (operation, email) => fx.a.isSuppressed(operation, email),
    markSendLeaseUnknown: (intent, message) =>
      fx.a.markSendLeaseUnknown(intent, message),
    finishSendIntent: () => {
      throw new Error("persist fail");
    },
  };
  try {
    const first = await executeAgentThreeSendWithLease(request({ ownerId: "proc-1" }), {
      environment: SMTP_ENV,
      createTransport: transport.createTransport,
      database: wrapped,
    });
    assert.equal(first.status, "reconciliation_required");
    assert.match(first.message, /Sem retry automático/i);
    const second = await executeAgentThreeSendWithLease(request({ ownerId: "proc-1" }), {
      environment: SMTP_ENV,
      createTransport: transport.createTransport,
      database: fx.a,
    });
    assert.equal(second.status, "reconciliation_required");
    assert.equal(transport.calls, 1);
  } finally {
    fx.close();
  }
});

test("D: confirmed nunca reenvia", async () => {
  const fx = fixture();
  const transport = countingTransport();
  try {
    const first = await executeAgentThreeSendWithLease(request({ ownerId: "proc-1" }), {
      environment: SMTP_ENV,
      createTransport: transport.createTransport,
      database: fx.a,
    });
    assert.equal(first.status, "sent");
    const again = await executeAgentThreeSendWithLease(request({ ownerId: "proc-2" }), {
      environment: SMTP_ENV,
      createTransport: transport.createTransport,
      database: fx.b,
    });
    assert.equal(again.status, "sent");
    assert.equal(again.messageId, first.messageId);
    assert.match(again.message, /duplicata bloqueada/i);
    assert.equal(transport.calls, 1);
  } finally {
    fx.close();
  }
});

test("E: lease stale exige reconciliação antes de novo claim", () => {
  let now = new Date("2026-09-13T10:00:00.000Z");
  const fx = fixture(() => now);
  try {
    const first = fx.a.claimSendLease(request({ ownerId: "proc-1" }));
    assert.equal(first.decision, "claimed");
    now = new Date("2026-09-13T10:03:00.000Z");
    const stale = fx.b.claimSendLease(request({ ownerId: "proc-2" }));
    assert.equal(stale.decision, "reconciliation_required");
    const key = buildSendLeaseKey("panek-puglesi", "clinic@example.test");
    const recon = fx.b.reconcileExpiredSendLease(key);
    assert.equal(recon, "claimed");
    const after = fx.b.claimSendLease(request({ ownerId: "proc-2" }));
    assert.equal(after.decision, "claimed");
  } finally {
    fx.close();
  }
});

test("H: suíte de lease não importa nodemailer nem chama SMTP real", async () => {
  const pipeline = await import("../src/lib/server/agent-three-send-pipeline.ts");
  const source = String(pipeline.executeAgentThreeSendWithLease);
  assert.equal(source.includes("nodemailer"), false);
});
