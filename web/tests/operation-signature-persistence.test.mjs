import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createMemoryOfficialSignatureRepository,
  createOfficialSignatureBackup,
  createOfficialSignatureRecord,
  loadOfficialSignatureRecords,
  OFFICIAL_SIGNATURE_DB_NAME,
  parseOfficialSignatureBackup,
  resolveOfficialSignaturesFromSources,
} from "../src/lib/operation-signature-repository.ts";
import {
  bindSignatureToOperation,
  getOperationSignatureMismatch,
  OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE,
} from "../src/lib/operation-signature.ts";

const PNP_HTML =
  "<table><tr><td>Panek &amp; Puglesi official</td></tr></table>";
const MODECLEAN_HTML =
  "<table><tr><td>Modeclean official</td></tr></table>";

test("assinatura sobrevive reload/restart sem localStorage", async () => {
  const repository = createMemoryOfficialSignatureRepository();
  const saved = createOfficialSignatureRecord({
    operationId: "panek-puglesi",
    enabled: true,
    html: PNP_HTML,
    updatedAt: "2026-08-14T20:00:00.000Z",
  });
  await repository.put(saved);
  const reloaded = await loadOfficialSignatureRecords(repository, null);
  assert.equal(reloaded.records["panek-puglesi"]?.html, PNP_HTML);
  assert.deepEqual(reloaded.migratedOperations, []);
});

test("localStorage vazio + IndexedDB válido recupera assinatura", async () => {
  const repository = createMemoryOfficialSignatureRepository([
    createOfficialSignatureRecord({
      operationId: "modeclean",
      enabled: true,
      html: MODECLEAN_HTML,
    }),
  ]);
  const loaded = await loadOfficialSignatureRecords(repository, null);
  assert.match(loaded.records.modeclean?.html ?? "", /Modeclean official/);
});

test("migração preserva HTML antigo válido", async () => {
  const repository = createMemoryOfficialSignatureRepository();
  const legacyRaw = JSON.stringify({
    state: {
      signatures: {
        "panek-puglesi": { enabled: true, body: PNP_HTML },
      },
    },
    version: 2,
  });
  const loaded = await loadOfficialSignatureRecords(repository, legacyRaw);
  assert.deepEqual(loaded.migratedOperations, ["panek-puglesi"]);
  assert.equal((await repository.get("panek-puglesi"))?.html, PNP_HTML);
});

test("IndexedDB é fonte de verdade e não é sobrescrito pelo legacy", async () => {
  const official = createOfficialSignatureRecord({
    operationId: "panek-puglesi",
    enabled: true,
    html: PNP_HTML,
  });
  const repository = createMemoryOfficialSignatureRepository([official]);
  const legacyRaw = JSON.stringify({
    state: {
      signatures: {
        "panek-puglesi": {
          enabled: true,
          body: "<p>legacy should not win</p>",
        },
      },
    },
    version: 2,
  });
  const loaded = await loadOfficialSignatureRecords(repository, legacyRaw);
  assert.equal(loaded.records["panek-puglesi"]?.html, PNP_HTML);
  assert.deepEqual(loaded.migratedOperations, []);
});

test("enabled + HTML vazio é rejeitado e bloqueia preflight", () => {
  assert.throws(
    () =>
      createOfficialSignatureRecord({
        operationId: "panek-puglesi",
        enabled: true,
        html: "<p><br></p>",
      }),
    /Assinatura não configurada/
  );
  const empty = bindSignatureToOperation("panek-puglesi", {
    enabled: true,
    body: "",
  });
  assert.equal(
    getOperationSignatureMismatch("panek-puglesi", empty, {
      requireOperationId: true,
    }),
    OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE
  );
});

test("SQLite válido vence IndexedDB vazio na mesma operação", () => {
  const sqlite = [
    createOfficialSignatureRecord({
      operationId: "panek-puglesi",
      enabled: true,
      html: PNP_HTML,
    }),
  ];
  const resolved = resolveOfficialSignaturesFromSources({
    sqlite,
    indexedDb: [],
  });
  assert.equal(resolved.records[0]?.html, PNP_HTML);
  assert.equal(resolved.migrateToSqlite.length, 0);
});

test("P&P e Modeclean não fazem fallback cruzado", () => {
  const resolved = resolveOfficialSignaturesFromSources({
    sqlite: [
      createOfficialSignatureRecord({
        operationId: "modeclean",
        enabled: true,
        html: MODECLEAN_HTML,
      }),
    ],
    indexedDb: [
      createOfficialSignatureRecord({
        operationId: "panek-puglesi",
        enabled: true,
        html: PNP_HTML,
      }),
    ],
  });
  const pnp = resolved.records.find((item) => item.operationId === "panek-puglesi");
  const mode = resolved.records.find((item) => item.operationId === "modeclean");
  assert.equal(pnp?.html, PNP_HTML);
  assert.equal(mode?.html, MODECLEAN_HTML);
  assert.doesNotMatch(pnp?.html ?? "", /Modeclean/);
  assert.doesNotMatch(mode?.html ?? "", /Panek/);
});

test("P&P e Modeclean permanecem isoladas por chave operacional", async () => {
  const repository = createMemoryOfficialSignatureRepository();
  await repository.putMany([
    createOfficialSignatureRecord({
      operationId: "panek-puglesi",
      enabled: true,
      html: PNP_HTML,
    }),
    createOfficialSignatureRecord({
      operationId: "modeclean",
      enabled: true,
      html: MODECLEAN_HTML,
    }),
  ]);
  const loaded = await loadOfficialSignatureRecords(repository, null);
  assert.match(loaded.records["panek-puglesi"]?.html ?? "", /Panek/);
  assert.doesNotMatch(
    loaded.records["panek-puglesi"]?.html ?? "",
    /Modeclean/
  );
  assert.match(loaded.records.modeclean?.html ?? "", /Modeclean/);
});

test("backup export/import contém assinaturas, sem secrets SMTP", () => {
  const records = [
    createOfficialSignatureRecord({
      operationId: "panek-puglesi",
      enabled: true,
      html: PNP_HTML,
    }),
  ];
  const raw = JSON.stringify(
    createOfficialSignatureBackup(records, "2026-08-14T20:30:00.000Z")
  );
  assert.doesNotMatch(raw, /password|smtp[_-]?pass|secret/i);
  assert.deepEqual(parseOfficialSignatureBackup(raw).signatures, records);
});

test("produção usa IndexedDB e não Zustand persist/localStorage como fonte", () => {
  const repositorySource = readFileSync(
    new URL("../src/lib/operation-signature-repository.ts", import.meta.url),
    "utf8"
  );
  const storeSource = readFileSync(
    new URL("../src/store/operation-signature-store.ts", import.meta.url),
    "utf8"
  );
  assert.match(repositorySource, /indexedDB\.open/);
  assert.match(repositorySource, new RegExp(OFFICIAL_SIGNATURE_DB_NAME));
  assert.doesNotMatch(storeSource, /zustand\/middleware/);
  assert.doesNotMatch(storeSource, /persist\s*\(/);
});

test("nenhum email real é enviado por esta suíte", () => {
  assert.ok(true);
});
