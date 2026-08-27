import assert from "node:assert/strict";
import test from "node:test";
import {
  handleDevRuntimeError,
  handleDevUnhandledRejection,
  isExclusivelyBrowserExtensionError,
} from "../src/lib/dev-error-logger.ts";

function extensionError(protocol = "chrome-extension") {
  const error = new Error(
    "Window Messenger Timeout: no response for cently:urlChanged received, waited for (2000)"
  );
  error.stack = `${error.name}: ${error.message}\n    at sendMessage (${protocol}://abcdefgh/aarSiteScript.js:1:234)`;
  return error;
}

function eventHarness(fields) {
  let prevented = false;
  return {
    event: {
      ...fields,
      preventDefault() {
        prevented = true;
      },
    },
    wasPrevented: () => prevented,
  };
}

test("DevErrorLogger ignores an unhandled rejection exclusively from chrome-extension", () => {
  const harness = eventHarness({ reason: extensionError() });
  const logs = [];

  handleDevUnhandledRejection(harness.event, (...args) => logs.push(args));

  assert.equal(harness.wasPrevented(), true);
  assert.deepEqual(logs, []);
  assert.equal(
    isExclusivelyBrowserExtensionError([extensionError("moz-extension")]),
    true
  );
  assert.equal(
    isExclusivelyBrowserExtensionError([extensionError("edge-extension")]),
    true
  );
});

test("DevErrorLogger ignores an error exclusively from chrome-extension", () => {
  const harness = eventHarness({
    error: extensionError(),
    message: "Window Messenger Timeout",
    filename: "chrome-extension://abcdefgh/aarSiteScript.js",
    lineno: 1,
    colno: 234,
  });
  const logs = [];

  handleDevRuntimeError(harness.event, (...args) => logs.push(args));

  assert.equal(harness.wasPrevented(), true);
  assert.deepEqual(logs, []);
});

test("DevErrorLogger keeps an app error from localhost, _next and src visible", () => {
  const error = new Error("App render failed");
  error.stack =
    "Error: App render failed\n" +
    "    at render (http://localhost:3000/_next/static/chunks/src_app_page_tsx.js:42:7)";
  const harness = eventHarness({
    error,
    message: error.message,
    filename: "http://localhost:3000/src/app/page.tsx",
    lineno: 42,
    colno: 7,
  });
  const logs = [];

  handleDevRuntimeError(harness.event, (...args) => logs.push(args));

  assert.equal(harness.wasPrevented(), false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[P&P runtime]");
  assert.match(logs[0].join(" "), /App render failed/);
});

test("DevErrorLogger keeps mixed app and extension stacks visible", () => {
  const error = extensionError();
  error.stack +=
    "\n    at onMessage (http://localhost:3000/_next/static/chunks/src_app_client_tsx.js:18:3)";
  const harness = eventHarness({ reason: error });
  const logs = [];

  handleDevUnhandledRejection(harness.event, (...args) => logs.push(args));

  assert.equal(harness.wasPrevented(), false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[P&P promise]");
  assert.match(logs[0].join(" "), /Window Messenger Timeout/);
});
