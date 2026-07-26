import assert from "node:assert/strict";
import test from "node:test";
import {
  isArtificialAgentOneResult,
  saveAgentOneLeads,
} from "../src/lib/agent-one-leads.ts";
import {
  INITIAL_AGENT_ONE_SNAPSHOT,
  addAgentOneSector,
  completeAgentOneSector,
  getAgentOneFoundLeadTotal,
  normalizeAgentOneSnapshot,
} from "../src/lib/agent-one-queue.ts";

function makeLead(index, prefix = "business", overrides = {}) {
  return {
    id: prefix + "-" + index,
    company: prefix + " " + index,
    website: "https://" + prefix + "-" + index + ".example.com",
    email: "contact" + index + "@example.com",
    phone: "+44 20 0000 " + String(index).padStart(4, "0"),
    address: index + " High Street, London",
    category: "Test",
    aiScore: 70,
    ...overrides,
  };
}

function makeResults(count, prefix = "business") {
  return Array.from({ length: count }, (_, index) => makeLead(index, prefix));
}

function saveInto(savedLeads) {
  return (lead) => {
    savedLeads.push(lead);
    return true;
  };
}

test("100 resultados com meta 3 salvam somente 3 leads novos", () => {
  const savedLeads = [];
  const result = saveAgentOneLeads({
    results: makeResults(100),
    existingSavedLeads: [],
    targetLeadCount: 3,
    source: "autonomous-google-maps",
    saveLead: saveInto(savedLeads),
  });

  assert.equal(result.savedLeadCount, 3);
  assert.equal(savedLeads.length, 3);
});

test("ignora existentes e seleciona até 3 outros leads novos", () => {
  const results = makeResults(100);
  const existingSavedLeads = [results[0], results[1]];
  const newlySaved = [];
  const result = saveAgentOneLeads({
    results,
    existingSavedLeads,
    targetLeadCount: 3,
    source: "serpapi-equilibrium",
    saveLead: saveInto(newlySaved),
  });

  assert.equal(result.savedLeadCount, 3);
  assert.deepEqual(
    newlySaved.map((lead) => lead.id),
    ["business-2", "business-3", "business-4"]
  );
});

test("salva 2 e registra 2 de 3 quando só existem 2 leads válidos", () => {
  const savedLeads = [];
  const result = saveAgentOneLeads({
    results: makeResults(2),
    existingSavedLeads: [],
    targetLeadCount: 3,
    source: "google-cse-live",
    saveLead: saveInto(savedLeads),
  });

  assert.equal(result.savedLeadCount, 2);
  assert.equal(savedLeads.length, 2);
});

test("duplicados normalizados na mesma resposta não aumentam a contagem", () => {
  const first = makeLead(0);
  const duplicate = makeLead(50, "duplicate", {
    company: "  BUSINESS   0  ",
    website: "https://www.business-0.example.com/",
  });
  const second = makeLead(1);
  const savedLeads = [];
  const result = saveAgentOneLeads({
    results: [first, duplicate, second],
    existingSavedLeads: [],
    targetLeadCount: 3,
    source: "autonomous-yell",
    saveLead: saveInto(savedLeads),
  });

  assert.equal(result.savedLeadCount, 2);
  assert.equal(savedLeads.length, 2);
});

test("total geral soma somente foundLeadCount efetivamente salvo", () => {
  const createdAt = "2026-07-26T10:00:00.000Z";
  const first = addAgentOneSector(
    INITIAL_AGENT_ONE_SNAPSHOT,
    { sector: "Accountants", location: "Hammersmith", targetLeadCount: 3 },
    "sector-1",
    createdAt
  );
  const queued = addAgentOneSector(
    first,
    { sector: "Cleaning", location: "Acton", targetLeadCount: 3 },
    "sector-2",
    createdAt
  );
  const firstComplete = completeAgentOneSector(
    queued,
    "sector-1",
    100,
    createdAt
  );
  const bothComplete = completeAgentOneSector(
    firstComplete,
    "sector-2",
    2,
    createdAt
  );

  assert.equal(getAgentOneFoundLeadTotal(bothComplete.queue), 5);

  const restored = normalizeAgentOneSnapshot({
    ...bothComplete,
    queue: bothComplete.queue.map((item) => ({
      ...item,
      foundLeadCount: 100,
    })),
  });
  assert.equal(getAgentOneFoundLeadTotal(restored.queue), 6);
});

test("resultados mock, fallback e padding artificial não entram no agente", () => {
  const mockSaved = [];
  const mockResult = saveAgentOneLeads({
    results: makeResults(10),
    existingSavedLeads: [],
    targetLeadCount: 3,
    source: "mock-engine",
    saveLead: saveInto(mockSaved),
  });
  const fallbackSaved = [];
  const fallbackResult = saveAgentOneLeads({
    results: makeResults(10),
    existingSavedLeads: [],
    targetLeadCount: 3,
    source: "serpapi-error-fallback",
    saveLead: saveInto(fallbackSaved),
  });
  const mixedSaved = [];
  const mixedResult = saveAgentOneLeads({
    results: [
      makeLead(0, "real"),
      makeLead(1, "padding", { id: "auto-sup-padding-1" }),
    ],
    existingSavedLeads: [],
    targetLeadCount: 3,
    source: "autonomous-google-maps+supplemented",
    saveLead: saveInto(mixedSaved),
  });

  assert.equal(isArtificialAgentOneResult("mock-engine"), true);
  assert.equal(mockResult.savedLeadCount, 0);
  assert.equal(fallbackResult.savedLeadCount, 0);
  assert.equal(mixedResult.savedLeadCount, 1);
  assert.equal(mixedSaved[0].id, "real-0");
});

test("dois setores com meta 3 nunca salvam mais de 6 leads novos", () => {
  const savedLeads = [];
  const first = saveAgentOneLeads({
    results: makeResults(100, "accountant"),
    existingSavedLeads: savedLeads,
    targetLeadCount: 3,
    source: "autonomous-google-maps",
    saveLead: saveInto(savedLeads),
  });
  const second = saveAgentOneLeads({
    results: makeResults(100, "cleaning"),
    existingSavedLeads: savedLeads,
    targetLeadCount: 3,
    source: "autonomous-yell",
    saveLead: saveInto(savedLeads),
  });

  assert.equal(first.savedLeadCount, 3);
  assert.equal(second.savedLeadCount, 3);
  assert.equal(first.savedLeadCount + second.savedLeadCount, 6);
  assert.equal(savedLeads.length, 6);
});
