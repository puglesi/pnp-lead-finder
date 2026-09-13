import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripClientSecrets } from "../src/lib/client-secret-policy.ts";

function src(relative) {
  return readFileSync(new URL("../" + relative, import.meta.url), "utf8");
}

test("G: browser state/payload/querystring sem passwords/API keys", () => {
  const settings = src("src/store/settings-store.ts");
  assert.match(settings, /partialize:/);
  assert.match(settings, /stripClientSecrets/);
  assert.match(settings, /version: 14/);
  assert.match(settings, /smtpPassword: ""/);

  const leadStore = src("src/store/lead-store.ts");
  assert.doesNotMatch(leadStore, /serpApiKey:/);
  assert.doesNotMatch(leadStore, /googleApiKey:/);

  const searchStatus = src("src/app/api/search/status/route.ts");
  assert.doesNotMatch(searchStatus, /searchParams\.get\("serpApiKey"\)/);
  assert.match(searchStatus, /clientKeyConfigured = false/);

  const searchRoute = src("src/app/api/search/route.ts");
  assert.match(searchRoute, /serpApiKey: undefined/);
  assert.doesNotMatch(searchRoute, /body\.serpApiKey/);

  const serpHook = src("src/hooks/use-serpapi-status.ts");
  assert.doesNotMatch(serpHook, /serpApiKey=\$/);
  assert.match(serpHook, /fetch\(`\/api\/search\/status`\)/);

  const emailSend = src("src/app/api/email/send/route.ts");
  assert.match(emailSend, /CLIENT_SECRETS_REJECTED/);
  assert.doesNotMatch(emailSend, /sendMail/);
  assert.doesNotMatch(emailSend, /smtpPassword/);

  const smtpUi = src("src/components/campaigns/smtp-autonomous-settings.tsx");
  assert.doesNotMatch(smtpUi, /type="password"/);
  assert.doesNotMatch(smtpUi, /smtpPassword/);

  const providerUi = src("src/components/campaigns/email-provider-settings.tsx");
  assert.doesNotMatch(providerUi, /type="password"/);
  assert.doesNotMatch(providerUi, /setResendApiKey|setSmtpConfig/);

  const searchUi = src("src/components/settings/search-settings-form.tsx");
  assert.doesNotMatch(searchUi, /id="serp-key"/);
  assert.doesNotMatch(searchUi, /setSerpApiKey/);
  assert.doesNotMatch(searchUi, /type="password"/);

  const clientSend = src("src/lib/email-providers/index.ts");
  assert.match(clientSend, /CLIENT_SEND_DISABLED/);
  assert.doesNotMatch(clientSend, /JSON\.stringify\(\{ providerId, credentials/);

  const stripped = stripClientSecrets({
    workers: 2,
    smtpPassword: "secret",
    serpApiKey: "key",
    delayMs: 4000,
  });
  assert.equal("smtpPassword" in stripped, false);
  assert.equal("serpApiKey" in stripped, false);
  assert.equal(stripped.workers, 2);
});
