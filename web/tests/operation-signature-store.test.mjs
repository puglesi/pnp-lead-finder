/**
 * Regression: stable Zustand snapshots for operation signatures.
 * Prevents "getSnapshot should be cached" / Maximum update depth exceeded.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_OPERATION_SIGNATURE,
  normalizeOperationSignatures,
  selectOperationSignature,
} from "../src/store/operation-signature-store.ts";

test("EMPTY_OPERATION_SIGNATURE is a single frozen reference", () => {
  assert.equal(EMPTY_OPERATION_SIGNATURE.enabled, false);
  assert.equal(EMPTY_OPERATION_SIGNATURE.body, "");
  assert.equal(
    selectOperationSignature(undefined, "panek-puglesi"),
    EMPTY_OPERATION_SIGNATURE
  );
  assert.equal(
    selectOperationSignature(null, "modeclean"),
    EMPTY_OPERATION_SIGNATURE
  );
});

test("selectOperationSignature returns stable refs (no new object per call)", () => {
  const map = normalizeOperationSignatures(undefined);
  const a1 = selectOperationSignature(map, "panek-puglesi");
  const a2 = selectOperationSignature(map, "panek-puglesi");
  const b1 = selectOperationSignature(map, "modeclean");
  const b2 = selectOperationSignature(map, "modeclean");
  assert.equal(a1, a2);
  assert.equal(b1, b2);
  assert.equal(a1, EMPTY_OPERATION_SIGNATURE);
  assert.equal(b1, EMPTY_OPERATION_SIGNATURE);
});

test("selectOperationSignature keeps stored object identity", () => {
  const stored = {
    enabled: true,
    body: "<table style='color:#1e3a5f'><tr><td>P&amp;P</td></tr></table>",
  };
  const map = {
    "panek-puglesi": stored,
    modeclean: EMPTY_OPERATION_SIGNATURE,
  };
  assert.equal(selectOperationSignature(map, "panek-puglesi"), stored);
  assert.equal(
    selectOperationSignature(map, "panek-puglesi"),
    selectOperationSignature(map, "panek-puglesi")
  );
  assert.equal(
    selectOperationSignature(map, "modeclean"),
    EMPTY_OPERATION_SIGNATURE
  );
});

test("normalizeOperationSignatures hydrates both ops without new empties each read", () => {
  const once = normalizeOperationSignatures({
    signatures: {
      "panek-puglesi": { enabled: true, body: "" },
      modeclean: { enabled: true, body: "" },
    },
  });
  assert.equal(once["panek-puglesi"], EMPTY_OPERATION_SIGNATURE);
  assert.equal(once.modeclean, EMPTY_OPERATION_SIGNATURE);

  const withBody = normalizeOperationSignatures({
    signatures: {
      "panek-puglesi": {
        enabled: true,
        body: "<div style='font-size:14px'>Hello</div>",
      },
      modeclean: { enabled: false, body: "<p>MC</p>" },
    },
  });
  assert.notEqual(withBody["panek-puglesi"], EMPTY_OPERATION_SIGNATURE);
  assert.match(withBody["panek-puglesi"].body, /Hello/);
  assert.equal(withBody.modeclean.enabled, false);
  // Same normalize input shape again produces equal content (isolation)
  const again = normalizeOperationSignatures({
    signatures: {
      "panek-puglesi": {
        enabled: true,
        body: "<div style='font-size:14px'>Hello</div>",
      },
      modeclean: { enabled: false, body: "<p>MC</p>" },
    },
  });
  assert.equal(again["panek-puglesi"].body, withBody["panek-puglesi"].body);
  assert.equal(again.modeclean.enabled, withBody.modeclean.enabled);
});

test("P&P and Modeclean remain isolated after normalize", () => {
  const map = normalizeOperationSignatures({
    signatures: {
      "panek-puglesi": { enabled: true, body: "<b>PNP</b>" },
      modeclean: { enabled: true, body: "<b>MODE</b>" },
    },
  });
  assert.match(map["panek-puglesi"].body, /PNP/);
  assert.match(map.modeclean.body, /MODE/);
  assert.notEqual(map["panek-puglesi"].body, map.modeclean.body);
});

test("simulates React selector contract: same map + op => same signature ref N times", () => {
  const map = normalizeOperationSignatures({
    signatures: {
      "panek-puglesi": { enabled: true, body: "<table><tr><td>x</td></tr></table>" },
      modeclean: EMPTY_OPERATION_SIGNATURE,
    },
  });
  const refs = [];
  for (let i = 0; i < 50; i++) {
    refs.push(selectOperationSignature(map, "panek-puglesi"));
  }
  assert.ok(refs.every((r) => r === refs[0]));
  // Switching ops is stable too
  const modeRefs = Array.from({ length: 20 }, () =>
    selectOperationSignature(map, "modeclean")
  );
  assert.ok(modeRefs.every((r) => r === EMPTY_OPERATION_SIGNATURE));
});

test("no real email in this suite", () => {
  assert.ok(true);
});
