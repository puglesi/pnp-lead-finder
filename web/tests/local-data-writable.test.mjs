import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  LocalDataUnavailableError,
  assertLocalDataWritable,
  ensureLocalDataWritable,
  getLocalDataAvailability,
  isLocalDataUnavailableError,
  isWritableHealth,
  prepareLocalDataWrite,
  probeLocalDataHealth,
  resetLocalDataAvailabilityForTests,
} from "../src/lib/local-data-availability.ts";

const root = dirname(fileURLToPath(import.meta.url));

function readSrc(relativePath) {
  return readFileSync(join(root, "..", relativePath), "utf8");
}

function writableHealth() {
  return {
    ok: true,
    status: "ok",
    writable: true,
    message: "Banco local íntegro e gravável.",
    databasePath: "C:\\Users\\Pugliese\\Documents\\pnp_lead_finder\\data\\pnp-lead-finder.sqlite",
    migrationVersion: 1,
  };
}

function unavailableHealth(message = "disk locked") {
  return {
    ok: false,
    status: "error",
    writable: false,
    message,
    databasePath: "C:\\Users\\Pugliese\\Documents\\pnp_lead_finder\\data\\pnp-lead-finder.sqlite",
    migrationVersion: 1,
  };
}

test("A: app inicia em checking e não trata checking como unavailable", () => {
  resetLocalDataAvailabilityForTests("checking");
  assert.equal(getLocalDataAvailability(), "checking");
  assert.equal(isWritableHealth({ ok: false, writable: false }), false);
  assert.notEqual(getLocalDataAvailability(), "unavailable");
  const bootstrap = readSrc("src/components/providers/local-data-bootstrap.tsx");
  assert.match(bootstrap, /availability === "checking"/);
  assert.match(bootstrap, /LOCAL_DATA_CHECKING_MESSAGE/);
  assert.doesNotMatch(bootstrap, /started\.current/);
  const card = readSrc("src/components/settings/data-integrity-card.tsx");
  assert.match(card, /healthState === "checking"/);
  assert.match(card, /Verificando banco local/);
});

test("B: health writable=true permite campaign update", async () => {
  resetLocalDataAvailabilityForTests("checking", async () => writableHealth());
  await ensureLocalDataWritable();
  assert.equal(getLocalDataAvailability(), "available");
  assert.doesNotThrow(() => assertLocalDataWritable());
  const campaignStore = readSrc("src/store/campaign-store.ts");
  assert.match(campaignStore, /assertLocalDataWritable\(\)/);
  assert.match(campaignStore, /updateCampaign:/);
  const detail = readSrc("src/components/campaigns/campaign-detail.tsx");
  assert.match(detail, /prepareLocalDataWrite/);
  assert.match(detail, /updateCampaign\(campaign\.id/);
});

test("C: HMR/reload reconstrói writable a partir do servidor", async () => {
  resetLocalDataAvailabilityForTests("unavailable", async () => writableHealth());
  assert.equal(getLocalDataAvailability(), "unavailable");
  await ensureLocalDataWritable();
  assert.equal(getLocalDataAvailability(), "available");
  const bootstrap = readSrc("src/components/providers/local-data-bootstrap.tsx");
  assert.match(bootstrap, /probeLocalDataHealth\(\)/);
  assert.match(bootstrap, /setLocalDataAvailability\("checking"\)/);
  assert.doesNotMatch(bootstrap, /if \(started\.current\) return/);
});

test("D: DB realmente indisponível bloqueia save de forma controlada", async () => {
  resetLocalDataAvailabilityForTests("checking", async () => unavailableHealth());
  await assert.rejects(
    () => ensureLocalDataWritable(),
    (error) => {
      assert.equal(isLocalDataUnavailableError(error), true);
      assert.equal(error instanceof LocalDataUnavailableError, true);
      return true;
    }
  );
  assert.equal(getLocalDataAvailability(), "unavailable");
  assert.equal(await prepareLocalDataWrite(), false);
  assert.throws(() => assertLocalDataWritable(), LocalDataUnavailableError);
  const detail = readSrc("src/components/campaigns/campaign-detail.tsx");
  assert.match(detail, /toast\.error\(LOCAL_DATA_UNAVAILABLE_MESSAGE\)/);
  assert.match(detail, /disabled=\{localDataWriteBlocked\}/);
});

test("E: DB indisponível bloqueia envio", async () => {
  resetLocalDataAvailabilityForTests("unavailable", async () => unavailableHealth());
  await assert.rejects(() => ensureLocalDataWritable(), LocalDataUnavailableError);
  const campaignStore = readSrc("src/store/campaign-store.ts");
  assert.match(
    campaignStore,
    /startBatchSend: async \(id, leadContexts\) => \{\s*await ensureLocalDataWritable\(\);/
  );
  const sendRoute = readSrc("src/app/api/email/send/route.ts");
  assert.match(sendRoute, /LOCAL_DATABASE_UNAVAILABLE/);
  assert.match(sendRoute, /createSendIntent/);
  const smtp = readSrc("src/lib/server/agent-three-smtp.ts");
  assert.match(smtp, /createSendIntent\(input\)/);
  assert.match(smtp, /envio real bloqueado antes do SMTP/);
  const detail = readSrc("src/components/campaigns/campaign-detail.tsx");
  assert.match(detail, /handleSendNow/);
  assert.match(detail, /localDataWriteBlocked/);
});

test("F: bloqueio esperado não vira unhandled rejection / Runtime Error", () => {
  const logger = readSrc("src/components/providers/dev-error-logger.tsx");
  assert.match(logger, /isLocalDataUnavailableError/);
  assert.match(logger, /event\.preventDefault\(\)/);
  const error = new LocalDataUnavailableError("unavailable");
  assert.equal(isLocalDataUnavailableError(error), true);
  assert.equal(
    isLocalDataUnavailableError(
      new Error("Banco local indisponível — ações que alteram dados e envios estão bloqueadas.")
    ),
    true
  );
  const detail = readSrc("src/components/campaigns/campaign-detail.tsx");
  assert.match(detail, /isLocalDataUnavailableError\(error\)/);
  assert.doesNotMatch(detail, /onClick=\{handleSave\}/);
});

test("G: campaign page carrega e salva com DB saudável", async () => {
  resetLocalDataAvailabilityForTests("checking", async () => writableHealth());
  const status = await probeLocalDataHealth();
  assert.equal(status, "available");
  assert.doesNotThrow(() => assertLocalDataWritable());
  const page = readSrc("src/app/(dashboard)/campanhas/[id]/page.tsx");
  assert.match(page, /CampaignDetail/);
  const healthRoute = readSrc("src/app/api/local-data/health/route.ts");
  assert.doesNotMatch(healthRoute, /ensureDailyBackup/);
  const hydrationRoute = readSrc("src/app/api/local-data/route.ts");
  assert.match(hydrationRoute, /Backup is best-effort/);
});

test("H: batch existente permanece intacto no fluxo de writable", () => {
  const availability = readSrc("src/lib/local-data-availability.ts");
  assert.doesNotMatch(availability, /DELETE FROM search_batches/);
  assert.doesNotMatch(availability, /localStorage\.clear/);
  assert.doesNotMatch(availability, /indexedDB\.deleteDatabase/);
  const bootstrap = readSrc("src/components/providers/local-data-bootstrap.tsx");
  assert.doesNotMatch(bootstrap, /clearUISession|localStorage\.clear/);
});

test("I: zero emails reais neste teste", () => {
  const availability = readSrc("src/lib/local-data-availability.ts");
  const client = readSrc("src/lib/local-data-client.ts");
  assert.equal(availability.includes("nodemailer"), false);
  assert.equal(availability.includes("sendMail"), false);
  assert.equal(client.includes("sendEmailServer"), false);
  const smtp = readSrc("src/lib/server/agent-three-smtp.ts");
  assert.match(smtp, /Banco local indisponível — envio real bloqueado/);
});

test("J: zero SerpAPI real neste teste", () => {
  const availability = readSrc("src/lib/local-data-availability.ts");
  const bootstrap = readSrc("src/components/providers/local-data-bootstrap.tsx");
  assert.equal(availability.includes("executeSearch"), false);
  assert.equal(availability.includes("serpapi.com"), false);
  assert.equal(bootstrap.includes("executeSearch"), false);
  assert.equal(bootstrap.includes("/api/search"), false);
});

test("ensure reconsulta o servidor quando o flag client está stale", async () => {
  let probes = 0;
  resetLocalDataAvailabilityForTests("unavailable", async () => {
    probes += 1;
    return writableHealth();
  });
  await ensureLocalDataWritable();
  assert.equal(probes, 1);
  assert.equal(getLocalDataAvailability(), "available");
  await ensureLocalDataWritable();
  assert.equal(probes, 1);
});

test("checking aguarda o health in-flight em vez de falhar imediato", async () => {
  let resolveProbe;
  const pending = new Promise((resolve) => {
    resolveProbe = resolve;
  });
  resetLocalDataAvailabilityForTests("checking", () => pending.then(() => writableHealth()));
  const waiting = ensureLocalDataWritable();
  assert.equal(getLocalDataAvailability(), "checking");
  resolveProbe();
  await waiting;
  assert.equal(getLocalDataAvailability(), "available");
});

after(() => {
  resetLocalDataAvailabilityForTests("checking");
});
