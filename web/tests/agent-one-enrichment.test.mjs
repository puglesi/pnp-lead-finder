import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  chunkAgentOneEnrichmentCandidates,
  mergeAgentOneContactUpdates,
  selectAgentOneEmailEnrichmentCandidates,
} from "../src/lib/agent-one-enrichment.ts";

function makeLead(index, overrides = {}) {
  return {
    id: `lead-${index}`,
    company: `Business ${index}`,
    website: `https://business-${index}.co.uk`,
    email: null,
    phone: "—",
    address: `${index} High Street, London`,
    category: "Test",
    aiScore: 70,
    ...overrides,
  };
}

test("seleciona apenas leads sem e-mail que possuem website empresarial", () => {
  const candidates = selectAgentOneEmailEnrichmentCandidates([
    makeLead(1),
    makeLead(2, {
      email: "hello@business-2.co.uk",
      emailSourceUrl: "https://business-2.co.uk/contact",
      emailDiscoveryMethod: "website_contact",
      emailIsGuessed: false,
    }),
    makeLead(3, { website: "https://google.com/maps/search/test" }),
    makeLead(4, { website: "https://example.com" }),
    makeLead(5, { website: "—" }),
    makeLead(6, { website: "business-6.co.uk" }),
  ]);

  assert.deepEqual(
    candidates.map((lead) => lead.id),
    ["lead-1", "lead-6"]
  );
});

test("mescla contatos sem sobrescrever dados existentes", () => {
  const leads = [
    makeLead(1, {
      emailValidationStatus: "invalid",
      emailValidationReason: "no_email",
    }),
    makeLead(2, {
      email: "owner@business-2.co.uk",
      phone: "+44 20 7000 0002",
      emailSourceUrl: "https://business-2.co.uk/contact",
      emailDiscoveryMethod: "website_contact",
      emailIsGuessed: false,
    }),
  ];

  const merged = mergeAgentOneContactUpdates(leads, [
    {
      id: "lead-1",
      email: "info@business-1.co.uk",
      phone: "+44 20 7000 0001",
    },
    {
      id: "lead-2",
      email: "info@business-2.co.uk",
      phone: "+44 20 7999 9999",
    },
  ]);

  assert.equal(merged[0].email, "info@business-1.co.uk");
  assert.equal(merged[0].phone, "+44 20 7000 0001");
  assert.equal(merged[0].emailValidationStatus, undefined);
  assert.equal(merged[0].emailValidationReason, undefined);
  assert.equal(merged[1].email, "owner@business-2.co.uk");
  assert.equal(merged[1].phone, "+44 20 7000 0002");
});

test("divide o reprocessamento em lotes limitados", () => {
  const batches = chunkAgentOneEnrichmentCandidates(
    Array.from({ length: 17 }, (_, index) => makeLead(index)),
    8
  );

  assert.deepEqual(
    batches.map((batch) => batch.length),
    [8, 8, 1]
  );
});

test("rota de enriquecimento não importa nem executa o pipeline SerpAPI", () => {
  const source = readFileSync(
    new URL("../src/app/api/agent-1/enrich/route.ts", import.meta.url),
    "utf8"
  );

  assert.equal(/executeSearch|serpapi/i.test(source), false);
  assert.equal(source.includes("enrichWebsiteLeadBatch"), true);
});
