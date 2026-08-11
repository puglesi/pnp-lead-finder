import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  describeAgentThreeStartBlock,
  AGENT_THREE_SMTP_MESSAGES,
} from "../src/lib/agent-three-smtp-contract.ts";
import {
  getAgentThreeSmtpAvailability,
  isAgentThreeRealSendEnabled,
  listMissingAgentThreeSmtpEnvVars,
  verifyAgentThreeSmtpConnection,
} from "../src/lib/server/agent-three-smtp-core.ts";
import { resolveTheme } from "../src/store/theme-store.ts";
import { getClearUiPreserveContract } from "../src/lib/clear-ui-session.ts";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("tema: resolve light, dark e system", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("tema: switcher e provider existem", async () => {
  const switcher = await readSource("src/components/layout/theme-switcher.tsx");
  const provider = await readSource("src/components/providers/theme-provider.tsx");
  const navbar = await readSource("src/components/layout/navbar.tsx");
  const css = await readSource("src/app/globals.css");
  assert.match(switcher, /Claro/);
  assert.match(switcher, /Escuro/);
  assert.match(switcher, /Sistema/);
  assert.match(provider, /applyThemeToDocument|resolveTheme/);
  assert.match(navbar, /ThemeSwitcher/);
  assert.match(css, /html\.light/);
  assert.match(css, /html\.dark|:root,\s*html\.dark/);
});

test("persistência: tema e cards preservados no contrato clear UI", () => {
  const contract = getClearUiPreserveContract();
  for (const key of [
    "theme",
    "collapsibleCards",
    "campaigns",
    "templates",
    "emailBlocklist",
    "lifetimeStats",
    "providerMessageIds",
  ]) {
    assert.ok(contract.includes(key), `missing ${key}`);
  }
});

test("envio bloqueado se AGENT3_REAL_SEND_ENABLED false", () => {
  const result = getAgentThreeSmtpAvailability("panek-puglesi", {
    AGENT3_REAL_SEND_ENABLED: "false",
  });
  assert.equal(result.status, "real_send_disabled");
  assert.match(result.message, /AGENT3_REAL_SEND_ENABLED/);
  assert.equal(result.diagnostics?.realSendEnabled, false);
});

test("envio permitido logicamente se flag true + SMTP completo (sem enviar)", () => {
  const env = {
    AGENT3_REAL_SEND_ENABLED: "true",
    PNP_SMTP_HOST: "smtp.example.invalid",
    PNP_SMTP_PORT: "465",
    PNP_SMTP_SECURE: "true",
    PNP_SMTP_USER: "sender@example.com",
    PNP_SMTP_APP_PASSWORD: "secret-not-returned",
    PNP_FROM_NAME: "P&P",
    PNP_REPLY_TO: "reply@example.com",
  };
  assert.equal(isAgentThreeRealSendEnabled(env), true);
  assert.deepEqual(listMissingAgentThreeSmtpEnvVars("panek-puglesi", env), []);
  const result = getAgentThreeSmtpAvailability("panek-puglesi", env);
  assert.equal(result.status, "connected");
  assert.equal(result.diagnostics?.realSendEnabled, true);
  // Never leaks password
  assert.doesNotMatch(JSON.stringify(result), /secret-not-returned/);
});

test("configuration_error lista nomes de variáveis, não valores", () => {
  const result = getAgentThreeSmtpAvailability("panek-puglesi", {
    AGENT3_REAL_SEND_ENABLED: "true",
    PNP_SMTP_HOST: "",
  });
  assert.equal(result.status, "configuration_error");
  assert.ok(result.diagnostics?.missingEnvVars.includes("PNP_SMTP_HOST"));
  assert.match(result.message, /PNP_SMTP_HOST/);
  // Env var *names* may include APP_PASSWORD; never include secret values.
  assert.doesNotMatch(result.message, /secret|Bearer |sk_live/i);
  assert.equal(JSON.stringify(result).includes("replace-with"), false);
});

test("preflight verify nunca chama sendMail", async () => {
  let sendMailCalls = 0;
  let verifyCalls = 0;
  const result = await verifyAgentThreeSmtpConnection("panek-puglesi", {
    environment: {
      AGENT3_REAL_SEND_ENABLED: "true",
      PNP_SMTP_HOST: "smtp.example.invalid",
      PNP_SMTP_PORT: "465",
      PNP_SMTP_SECURE: "true",
      PNP_SMTP_USER: "sender@example.com",
      PNP_SMTP_APP_PASSWORD: "x",
      PNP_FROM_NAME: "P&P",
      PNP_REPLY_TO: "reply@example.com",
    },
    createTransport: () => ({
      sendMail: async () => {
        sendMailCalls += 1;
        return { messageId: "should-not-happen" };
      },
      verify: async () => {
        verifyCalls += 1;
      },
    }),
  });
  assert.equal(result.status, "connected");
  assert.equal(sendMailCalls, 0);
  assert.equal(verifyCalls, 1);
  assert.equal(result.diagnostics?.verifiedLive, true);
});

test("causas humanas de bloqueio do Start", () => {
  assert.match(
    describeAgentThreeStartBlock({ realSendDisabled: true }),
    /AGENT3_REAL_SEND_ENABLED|Envio real desativado/
  );
  assert.match(
    describeAgentThreeStartBlock({ campaignMissing: true }),
    /campanha/i
  );
  assert.match(
    describeAgentThreeStartBlock({ previewRequired: true }),
    /[Pp]révia/
  );
  assert.match(
    describeAgentThreeStartBlock({ noEligible: true }),
    /elegível/
  );
  assert.match(
    describeAgentThreeStartBlock({
      configurationError: true,
      missingEnvVars: ["PNP_SMTP_HOST"],
    }),
    /PNP_SMTP_HOST/
  );
});

test("Agente 3 UI: Verificar envio e ordem simplificada", async () => {
  const source = await readSource(
    "src/components/agents/agent-three-sender.tsx"
  );
  assert.match(source, /Verificar envio/);
  assert.match(source, /verifySend/);
  assert.match(source, /Detalhes avançados/);
  assert.match(source, /1\. Operação/);
  assert.match(source, /4\. Prévia/);
  assert.match(source, /6\. Verificar/);
  assert.match(source, /describeAgentThreeStartBlock/);
  // No credential dumps
  assert.doesNotMatch(source, /SMTP_APP_PASSWORD\s*=/);
  assert.doesNotMatch(source, /password:\s*["']/);
});

test("API client preserva mensagem do servidor", async () => {
  const source = await readSource("src/lib/agent-three-api.ts");
  assert.match(source, /serverMessage|record\.message/);
  assert.match(source, /diagnostics/);
});

test("mensagem real_send_disabled cita a variável de ambiente", () => {
  assert.match(
    AGENT_THREE_SMTP_MESSAGES.real_send_disabled,
    /AGENT3_REAL_SEND_ENABLED/
  );
});

test("pipeline neon e tema claro no indicador de lote", async () => {
  const source = await readSource(
    "src/components/pipeline/batch-pipeline-indicator.tsx"
  );
  assert.match(source, /neon-cyan|text-cyan-700/);
  assert.match(source, /dark:text-cyan/);
  assert.match(source, /Lote ativo/);
});

test("salvar alterações presente em campanha e agente 3", async () => {
  const detail = await readSource(
    "src/components/campaigns/campaign-detail.tsx"
  );
  const agent3 = await readSource(
    "src/components/agents/agent-three-sender.tsx"
  );
  assert.match(detail, /Salvar alterações/);
  assert.match(detail, /Alterações não salvas/);
  assert.match(agent3, /Salvar alterações/);
  assert.match(agent3, /Alterações não salvas/);
});
