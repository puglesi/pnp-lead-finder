import assert from "node:assert/strict";
import test from "node:test";
import {
  isEmailSyntaxValid,
  normalizeEmail,
  validateEmailLocally,
} from "../src/lib/email-validation.ts";
import { checkEmailDomain } from "../src/lib/email-domain-check.ts";

function dnsError(code) {
  return Object.assign(new Error(code), { code });
}

const mxResolver = {
  async resolveMx() {
    return [{ exchange: "mx.example.test", priority: 10 }];
  },
  async resolve4() {
    return ["192.0.2.1"];
  },
  async resolve6() {
    return [];
  },
};

const noMxResolver = {
  async resolveMx() {
    throw dnsError("ENODATA");
  },
  async resolve4() {
    return ["192.0.2.2"];
  },
  async resolve6() {
    throw dnsError("ENODATA");
  },
};

const mxCheck = async (domain) => ({
  domain,
  exists: true,
  hasMxRecords: true,
  reason: null,
});

test("normaliza e-mail com trim, lowercase e remoção de espaços", () => {
  assert.equal(normalizeEmail("  Sales @ Example.COM  "), "sales@example.com");
  assert.equal(normalizeEmail("   "), null);
});

test("sintaxe inválida é rejeitada antes do DNS", async () => {
  let dnsCalled = false;
  const result = await validateEmailLocally("invalid-address", async () => {
    dnsCalled = true;
    return { domain: "", exists: false, hasMxRecords: false, reason: "domain_not_found" };
  });
  assert.equal(isEmailSyntaxValid("invalid-address"), false);
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "invalid_syntax");
  assert.equal(dnsCalled, false);
});

test("endereço ausente resulta em no_email", async () => {
  const result = await validateEmailLocally(null, mxCheck);
  assert.equal(result.status, "no_email");
  assert.equal(result.reason, "no_email");
});

test("domínio existente sem MX resulta em no_mx_records", async () => {
  const domain = await checkEmailDomain("example.test", noMxResolver, 100);
  assert.deepEqual(domain, {
    domain: "example.test",
    exists: true,
    hasMxRecords: false,
    reason: "no_mx_records",
  });
  const result = await validateEmailLocally("person@example.test", async () => domain);
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "no_mx_records");
});

test("domínio com MX é identificado por mock DNS determinístico", async () => {
  const result = await checkEmailDomain("example.test", mxResolver, 100);
  assert.equal(result.exists, true);
  assert.equal(result.hasMxRecords, true);
  assert.equal(result.reason, null);
});

test("sintaxe e MX aprovados resultam em unknown, nunca valid", async () => {
  const result = await validateEmailLocally("person@example.test", mxCheck);
  assert.equal(result.status, "unknown");
  assert.notEqual(result.status, "valid");
  assert.equal(result.reason, "mailbox_not_verified");
});

test("endereço role-based é sinalizado sem virar inválido", async () => {
  const result = await validateEmailLocally("INFO@example.test", mxCheck);
  assert.equal(result.isRoleBasedEmail, true);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "mailbox_not_verified");
});
