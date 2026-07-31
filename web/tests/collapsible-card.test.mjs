import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("collapsible card persists an independent state and exposes accessible controls", async () => {
  const source = await readSource("src/components/ui/collapsible-card.tsx");

  assert.match(source, /window\.localStorage\.getItem/);
  assert.match(source, /window\.localStorage\.setItem/);
  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /aria-controls=\{contentId\}/);
  assert.match(source, /inert=\{isOpen \? undefined : true\}/);
  assert.match(source, /transition-\[grid-template-rows,opacity\]/);
  assert.match(source, /<ChevronDown/);
});

test("main pages and agents use unique collapsible card keys", async () => {
  const paths = [
    "src/components/dashboard/dashboard-tabs.tsx",
    "src/app/(dashboard)/busca/page.tsx",
    "src/components/agents/agent-one-garimpeiro.tsx",
    "src/components/agents/agent-two-validator.tsx",
    "src/components/agents/agent-three-sender.tsx",
    "src/app/(dashboard)/campanhas/page.tsx",
    "src/app/(dashboard)/configuracoes/page.tsx",
  ];
  const source = (await Promise.all(paths.map(readSource))).join("\n");
  const keys = [...source.matchAll(/(?:storageKey|cardStorageKey)="([^"]+)"/g)].map(
    (match) => match[1]
  );

  assert.ok(keys.length >= 13);
  assert.equal(new Set(keys).size, keys.length);
});

test("button base makes enabled and disabled states visually explicit", async () => {
  const source = await readSource("src/components/ui/button.tsx");

  assert.match(source, /cursor-pointer/);
  assert.match(source, /disabled:cursor-not-allowed/);
  assert.match(source, /disabled:opacity-50/);
  assert.match(source, /disabled:hover:bg-muted/);
  assert.match(source, /focus-visible:ring-2/);
});
