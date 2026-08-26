import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertNoSyntheticLeads,
  capRealSearchResults,
  rejectSyntheticLeadsForRealSearch,
  SYNTHETIC_FORBIDDEN_MESSAGE,
} from "../src/lib/search/real-search-guard.ts";
import {
  getBatchEligibleLeads,
  getBatchLeadStats,
  isBatchCampaignEligible,
} from "../src/lib/lead-batch.ts";
import { classifyLocationMatch } from "../src/lib/location-match.ts";
import {
  enrichWebsiteContacts,
} from "../src/lib/search/scrapers/website-enricher.ts";
import { buildAgentTwoQueue } from "../src/lib/agent-two-queue.ts";
import {
  createInitialAgentThreeSnapshot,
  isAgentThreeItemEligible,
  loadAgentThreeLeads,
} from "../src/lib/agent-three-queue.ts";
import { stampLegacyLeadQuality } from "../src/lib/lead-provenance.ts";

const now = "2026-08-24T12:00:00.000Z";
const fetchedHosts = [];

function discoveredLead(id, email, extras = {}) {
  return {
    id,
    company: "Company " + id,
    website: "https://" + id + ".co.uk",
    email,
    phone: "+44 20 7000 0001",
    address: "12 King Street, London W6 0JA",
    category: "Mortgage broker",
    aiScore: 80,
    synthetic: false,
    emailIsGuessed: false,
    emailSourceUrl: email ? "https://" + id + ".co.uk/contact" : null,
    emailDiscoveryMethod: email ? "website_contact" : null,
    phoneSourceUrl: "https://" + id + ".co.uk/contact",
    ...extras,
  };
}

test("A. busca real com 37 de 160 termina em 37, não 160", () => {
  const found = Array.from({ length: 37 }, (_, index) =>
    discoveredLead("serp-ChIJ-" + index, null)
  );
  const result = capRealSearchResults(found, 160);
  assert.equal(result.leads.length, 37);
  assert.equal(result.foundRealCount, 37);
  assert.equal(result.requestedCount, 160);
  assert.equal(result.sourceExhausted, true);
  const padded = capRealSearchResults(found, 160);
  assert.equal(padded.leads.length === 160, false);
});

test("B/C. generateLeadsForSearch e padWithFallback não existem no caminho real", () => {
  const serpapi = readFileSync(
    new URL("../src/lib/search/providers/serpapi.ts", import.meta.url),
    "utf8"
  );
  const autonomous = readFileSync(
    new URL("../src/lib/search/providers/autonomous.ts", import.meta.url),
    "utf8"
  );
  const engine = readFileSync(
    new URL("../src/lib/search/engine.ts", import.meta.url),
    "utf8"
  );
  const leadStore = readFileSync(
    new URL("../src/store/lead-store.ts", import.meta.url),
    "utf8"
  );
  assert.equal(serpapi.includes("generateLeadsForSearch"), false);
  assert.equal(serpapi.includes("padWithFallback"), false);
  assert.equal(serpapi.includes("guessEmail"), false);
  assert.equal(autonomous.includes("generateLeadsForSearch"), false);
  assert.equal(autonomous.includes("padWithFallback"), false);
  assert.equal(autonomous.includes("guessEmail"), false);
  assert.equal(engine.includes("generateLeadsForSearch"), false);
  assert.equal(leadStore.includes("generateLeadsForSearch"), false);
});

test("D. mock lead nunca entra em lote real", () => {
  const mixed = [
    discoveredLead("serp-ChIJ1", "info@real.co.uk"),
    {
      ...discoveredLead("auto-sup-mock-1", "hello@fake.co.uk"),
      synthetic: true,
      sourceKind: "mock",
    },
  ];
  assert.throws(() => assertNoSyntheticLeads(mixed, true), /proibidos em busca real/);
  const stripped = rejectSyntheticLeadsForRealSearch(mixed, true);
  assert.equal(stripped.length, 1);
  assert.equal(stripped[0].id, "serp-ChIJ1");
  const explicitMock = rejectSyntheticLeadsForRealSearch(mixed, false);
  assert.equal(explicitMock.length, 2);
});

test("E. info@domain presumido sem source não é elegível", () => {
  const guessed = {
    id: "serp-ChIJ-guess",
    company: "Guessed Ltd",
    website: "https://guessed.co.uk",
    email: "info@guessed.co.uk",
    phone: "",
    address: "London W6 0JA",
    category: "Broker",
    aiScore: 80,
    emailValidationStatus: "unknown",
    emailValidationReason: "mailbox_not_verified",
    hasMxRecords: true,
  };
  assert.equal(isBatchCampaignEligible(guessed), false);
  const stats = getBatchLeadStats([guessed]);
  assert.equal(stats.withEmail, 0);
  assert.equal(stats.eligible, 0);
  assert.equal(stats.guessedEmail, 1);
});

test("F. email extraído da contact page persiste source URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    fetchedHosts.push(value);
    if (value === "https://www.acme.co.uk/") {
      return new Response(
        '<html><body><a href="/contact-us">Contact</a></body></html>',
        { headers: { "content-type": "text/html" } }
      );
    }
    if (value === "https://www.acme.co.uk/contact-us") {
      return new Response(
        '<html><body><a href="mailto:sales@acme.co.uk">email</a></body></html>',
        { headers: { "content-type": "text/html" } }
      );
    }
    return new Response("Not found", { status: 404 });
  };
  try {
    const result = await enrichWebsiteContacts("https://www.acme.co.uk");
    assert.equal(result.email, "sales@acme.co.uk");
    assert.equal(result.emailSourceUrl, "https://www.acme.co.uk/contact-us");
    assert.equal(result.emailSourceType, "website_contact");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("G. telefone extraído do site persiste provenance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<html><body>Call 020 7123 4567</body></html>", {
      headers: { "content-type": "text/html" },
    });
  try {
    const result = await enrichWebsiteContacts("https://phone-co.co.uk");
    assert.equal(result.phone, "+44 20 7123 4567");
    assert.equal(result.phoneSourceUrl, "https://phone-co.co.uk/");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("H. outside_target identificado", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: "West London, UK",
      address: "69 Vallance Rd, London, E1 5BS",
    }),
    "outside_target"
  );
  assert.equal(
    classifyLocationMatch({
      requestedLocation: "West London, UK",
      address: "12 King Street, London W6 0JA",
    }),
    "verified"
  );
});

test("I. duplicado não conta como inválido", () => {
  const leads = [
    discoveredLead("a", "same@ex.test", {
      emailValidationStatus: "unknown",
      emailValidationReason: "mailbox_not_verified",
      hasMxRecords: true,
    }),
    discoveredLead("b", "same@ex.test", {
      emailValidationStatus: "duplicate",
      emailValidationReason: "duplicate_of:a",
    }),
  ];
  const stats = getBatchLeadStats(leads);
  assert.equal(stats.duplicates, 1);
  assert.equal(stats.invalid, 0);
  assert.equal(stats.eligible, 1);
});

test("J. mailbox_not_verified não conta como invalid", () => {
  const lead = discoveredLead("mx", "hello@mx.co.uk", {
    emailValidationStatus: "unknown",
    emailValidationReason: "mailbox_not_verified",
    hasMxRecords: true,
  });
  const stats = getBatchLeadStats([lead]);
  assert.equal(stats.invalid, 0);
  assert.equal(stats.unconfirmed, 1);
  assert.equal(stats.eligible, 1);
  assert.equal(isBatchCampaignEligible(lead), true);
});

test("K. synthetic lead bloqueado no Agent 2", () => {
  const queue = buildAgentTwoQueue(
    [
      {
        ...discoveredLead("auto-sup-mock-99", "info@pad.co.uk"),
        synthetic: true,
        sourceKind: "mock",
        id: "auto-sup-mock-99",
      },
    ],
    now
  );
  assert.equal(queue[0].reason, "synthetic_source");
  assert.equal(
    isBatchCampaignEligible({
      ...discoveredLead("auto-sup-mock-99", "info@pad.co.uk"),
      id: "auto-sup-mock-99",
      synthetic: true,
    }),
    false
  );
});

test("L. synthetic lead bloqueado no Agent 3", () => {
  const synthetic = {
    ...discoveredLead("auto-sup-mock-3", "hello@pad.co.uk", {
      emailValidationStatus: "unknown",
      emailValidationReason: "mailbox_not_verified",
      hasMxRecords: true,
    }),
    id: "auto-sup-mock-3",
    synthetic: true,
    sourceKind: "mock",
  };
  const loaded = loadAgentThreeLeads(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [synthetic],
    1,
    now
  );
  assert.equal(loaded.addedItems[0].queueStatus, "blocked");
  assert.equal(loaded.addedItems[0].exclusionReason, "synthetic");
  assert.equal(isAgentThreeItemEligible(loaded.addedItems[0]), false);
});

test("M. zero emails reais → zero elegíveis", () => {
  const leads = [
    discoveredLead("serp-1", null),
    {
      id: "serp-2",
      company: "Guess Co",
      website: "https://guess.co.uk",
      email: "info@guess.co.uk",
      phone: "",
      address: "London",
      category: "Broker",
      aiScore: 70,
      emailValidationStatus: "unknown",
      emailValidationReason: "mailbox_not_verified",
      hasMxRecords: true,
    },
  ];
  assert.equal(getBatchEligibleLeads(leads).length, 0);
  assert.equal(getBatchLeadStats(leads).withEmail, 0);
});

test("legacy 90-like SerpAPI rows are marked guessed, not discovered", () => {
  const stamped = stampLegacyLeadQuality({
    id: "serp-ChIJxxxx",
    company: "Charles Cameron & Associates",
    website: "https://www.ccameron.co.uk/",
    email: "hello@ccameron.co.uk",
    phone: "+44 20 7000 0000",
    address: "154 Blackfriars Rd, London SE1 8EN",
    category: "Mortgage broker",
    aiScore: 98,
    emailValidationStatus: "unknown",
    emailValidationReason: "mailbox_not_verified",
    hasMxRecords: true,
  }, "West London, UK");
  assert.equal(stamped.synthetic, false);
  assert.equal(stamped.sourceKind, "serpapi");
  assert.equal(stamped.emailIsGuessed, true);
  assert.equal(stamped.locationMatch, "outside_target");
  assert.equal(isBatchCampaignEligible(stamped), false);
});

test("N. zero SerpAPI real nesta suíte", () => {
  for (const url of fetchedHosts) {
    assert.equal(url.includes("serpapi.com"), false, url);
  }
  assert.ok(SYNTHETIC_FORBIDDEN_MESSAGE.length > 0);
});
