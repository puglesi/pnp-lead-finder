import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyLocationMatch } from "../src/lib/location-match.ts";
import {
  PNP_TARGET_AREA_ID,
  canonicalPostcodeDistrict,
  getRegionAuditLabels,
  resolveGeoRegion,
} from "../src/lib/geo/regions.ts";
import {
  isPlausibleUkPhone,
  normalizeUkPhone,
  parsePublishedPhone,
  pickBestPhoneFromHtml,
} from "../src/lib/uk-phone.ts";
import {
  collectUntilTarget,
  isInsideSearchTarget,
  selectOperationalSearchLeads,
} from "../src/lib/search/targeted-search.ts";
import { buildProviderLocationQuery } from "../src/lib/geo/regions.ts";
import { capRealSearchResults } from "../src/lib/search/real-search-guard.ts";
import { isBatchCampaignEligible } from "../src/lib/lead-batch.ts";
import { selectAgentOneEmailEnrichmentCandidates } from "../src/lib/agent-one-enrichment.ts";
import {
  DEFAULT_LOCATION_FILTER,
  locationMatchReviewLabel,
} from "../src/lib/location-match.ts";
import {
  createInitialAgentThreeSnapshot,
  isAgentThreeItemEligible,
  loadAgentThreeLeads,
} from "../src/lib/agent-three-queue.ts";

const WEST = "West London, UK";
const PNP = "P&P Target Area";
const thisFile = readFileSync(new URL(import.meta.url), "utf8");

test("A. W6 postcode -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: WEST,
      address: "12 King Street, London W6 0JA",
    }),
    "verified"
  );
});

test("B. W12 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: WEST,
      postcode: "W12 8QT",
    }),
    "verified"
  );
});

test("C. TW8 na área P&P -> verified", () => {
  const region = resolveGeoRegion(WEST);
  assert.ok(region);
  assert.equal(region.id, PNP_TARGET_AREA_ID);
  assert.equal(region.name, "P&P Target Area");
  assert.equal(region.displaySubtitle, "West & South West London");
  assert.equal(getRegionAuditLabels(region).inside, "Dentro da área P&P");
  assert.equal(getRegionAuditLabels(region).outside, "Fora da área");
  assert.equal(
    getRegionAuditLabels(region).unknown,
    "Localização desconhecida"
  );
  assert.equal(region.verifiedDistricts.includes("TW8"), true);
  assert.equal(
    classifyLocationMatch({
      requestedLocation: WEST,
      address: "Kew Bridge Road, Brentford TW8 0EF",
    }),
    "verified"
  );
});

test("D. SE1 -> outside_target", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: WEST,
      address: "70 Great Suffolk St, London SE1 0BL",
    }),
    "outside_target"
  );
});

test("E. E14 -> outside_target", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: WEST,
      address: "40 Bank St, Canary Wharf, London E14 5NR",
    }),
    "outside_target"
  );
});

test("F. sem postcode -> unknown, não outside automaticamente", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: WEST,
      address: "Somewhere in London",
    }),
    "unknown"
  );
});

test("P&P. W9 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "W9 1AA",
    }),
    "verified"
  );
});

test("P&P. NW10 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      address: "Harlesden High Street, London NW10 4NJ",
    }),
    "verified"
  );
});

test("P&P. TW1 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "TW1 3BZ",
    }),
    "verified"
  );
});

test("P&P. TW7 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "TW7 6BE",
    }),
    "verified"
  );
});

test("P&P. TW11 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "TW11 8ST",
    }),
    "verified"
  );
});

test("P&P. SW1A -> verified via prefixo SW1", () => {
  assert.equal(canonicalPostcodeDistrict("SW1A"), "SW1");
  assert.equal(canonicalPostcodeDistrict("W1B"), "W1");
  assert.equal(canonicalPostcodeDistrict("W10"), "W10");
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      address: "10 Downing Street, London SW1A 2AA",
    }),
    "verified"
  );
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "W1K 1AA",
    }),
    "verified"
  );
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "SW1X 8AA",
    }),
    "verified"
  );
});

test("P&P. SW6 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      address: "Fulham Road, London SW6 1AA",
    }),
    "verified"
  );
});

test("P&P. SW13 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "SW13 9EE",
    }),
    "verified"
  );
});

test("P&P. SW15 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "SW15 1AA",
    }),
    "verified"
  );
});

test("P&P. SW18 -> verified", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "SW18 4AA",
    }),
    "verified"
  );
});

test("P&P. SE1, E14, N1, SW19 -> outside_target", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      address: "70 Great Suffolk St, London SE1 0BL",
    }),
    "outside_target"
  );
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      address: "40 Bank St, Canary Wharf, London E14 5NR",
    }),
    "outside_target"
  );
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "N1 9GU",
    }),
    "outside_target"
  );
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      postcode: "SW19 1AA",
    }),
    "outside_target"
  );
});

test("P&P. sem postcode + bairro reconhecido -> likely", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      address: "High Street, Hammersmith",
    }),
    "likely"
  );
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      address: "Northcote Road, Battersea",
    }),
    "likely"
  );
});

test("G. 20 solicitados + primeiros 18 outside continua em páginas reais", async () => {
  const pages = [
    [
      ...Array.from({ length: 18 }, (_, i) => ({
        id: "out-" + i,
        locationMatch: "outside_target",
      })),
      { id: "in-0", locationMatch: "verified" },
      { id: "in-1", locationMatch: "likely" },
    ],
    Array.from({ length: 20 }, (_, i) => ({
      id: "in-more-" + i,
      locationMatch: "verified",
    })),
  ];
  let fetched = 0;
  const result = await collectUntilTarget({
    requestedInside: 20,
    maxPages: 4,
    getId: (item) => item.id,
    isInside: (item) => isInsideSearchTarget(item.locationMatch),
    fetchPage: async (pageIndex) => {
      fetched += 1;
      const items = pages[pageIndex] ?? [];
      return { items, shortPage: items.length < 20 };
    },
  });
  assert.equal(fetched, 2);
  assert.equal(result.insideTargetFound, 22);
  assert.equal(result.sourceExhausted, false);
  assert.equal(result.inspected.some((item) => item.id.startsWith("auto-sup")), false);
});

test("H. fonte esgotada em 8 West London retorna 8, não inventa 12", async () => {
  const result = await collectUntilTarget({
    requestedInside: 20,
    maxPages: 4,
    getId: (item) => item.id,
    isInside: (item) => isInsideSearchTarget(item.locationMatch),
    fetchPage: async (pageIndex) => {
      if (pageIndex > 0) return { items: [], shortPage: true };
      return {
        items: Array.from({ length: 8 }, (_, i) => ({
          id: "west-" + i,
          locationMatch: "verified",
        })),
        shortPage: true,
      };
    },
  });
  assert.equal(result.insideTargetFound, 8);
  assert.equal(result.inspected.length, 8);
  assert.equal(result.sourceExhausted, true);
  const capped = capRealSearchResults(result.inspected, 20);
  assert.equal(capped.leads.length, 8);
});

test("I. tel:+442012345678 -> telefone válido", () => {
  const parsed = parsePublishedPhone("+442012345678", "tel_href");
  assert.ok(parsed);
  assert.equal(parsed.phone, "+44 20 1234 5678");
  const fromHtml = pickBestPhoneFromHtml(
    '<a href="tel:+442012345678">Call</a>'
  );
  assert.equal(fromHtml?.phone, "+44 20 1234 5678");
  assert.equal(fromHtml?.discoveryMethod, "tel_href");
});

test("J. 020 7123 4567 -> válido", () => {
  assert.equal(isPlausibleUkPhone("020 7123 4567"), true);
  assert.equal(normalizeUkPhone("020 7123 4567"), "+44 20 7123 4567");
  const labeled = pickBestPhoneFromHtml("Call 020 7123 4567 today");
  assert.equal(labeled?.phone, "+44 20 7123 4567");
});

test("K. 0260824121105 isolado/ruidoso -> rejeitado", () => {
  assert.equal(isPlausibleUkPhone("0260824121105"), false);
  assert.equal(parsePublishedPhone("0260824121105"), null);
  assert.equal(pickBestPhoneFromHtml("0260824121105"), null);
  assert.equal(
    pickBestPhoneFromHtml(
      "<script>var tracking=0260824121105; var ts=1700000000000;</script>02071234567"
    ),
    null
  );
  assert.equal(isPlausibleUkPhone("+44 (0)20 7123 4567"), true);
  assert.equal(normalizeUkPhone("+44 (0)20 7123 4567"), "+44 20 7123 4567");
});

test("L. synthetic permanece 0 — query geo sem mock/padding", () => {
  const query = buildProviderLocationQuery("Property Finance Broker", PNP);
  assert.equal(
    query.q,
    "Property Finance Broker in West and South West London"
  );
  assert.equal(query.ll, resolveGeoRegion(PNP)?.mapsLl);
  assert.equal(query.q.endsWith(" in West London"), false);
  const westAlias = buildProviderLocationQuery(
    "Property Finance Broker",
    WEST
  );
  assert.equal(westAlias.q, query.q);
  assert.equal(westAlias.ll, query.ll);
  const source = readFileSync(
    new URL("../src/lib/search/providers/serpapi.ts", import.meta.url),
    "utf8"
  );
  assert.equal(source.includes("generateLeadsForSearch"), false);
  assert.equal(source.includes("padWithFallback"), false);
  const capped = capRealSearchResults(
    [
      { id: "serp-1", synthetic: false, sourceKind: "serpapi" },
      { id: "serp-2", synthetic: false, sourceKind: "serpapi" },
    ],
    20
  );
  assert.equal(capped.leads.length, 2);
  assert.equal(
    capped.leads.some((lead) => lead.id.startsWith("auto-sup") || lead.synthetic),
    false
  );
});

test("M. guessed email permanece proibido", () => {
  assert.equal(
    isBatchCampaignEligible({
      id: "serp-1",
      company: "Guess",
      website: "https://guess.co.uk",
      email: "info@guess.co.uk",
      phone: "",
      address: "London W6 0JA",
      category: "Broker",
      aiScore: 80,
      emailValidationStatus: "unknown",
      emailValidationReason: "mailbox_not_verified",
      hasMxRecords: true,
    }),
    false
  );
});

test("N. zero emails reais → zero elegíveis", () => {
  assert.equal(
    isBatchCampaignEligible({
      id: "serp-no-email",
      company: "West Ltd",
      website: "https://west.co.uk",
      email: null,
      phone: "+44 20 7123 4567",
      address: "London W6 0JA",
      category: "Broker",
      aiScore: 80,
    }),
    false
  );
});

test("O. zero SerpAPI real durante testes", () => {
  assert.equal(/from ["'][^"']*providers\/serpapi/.test(thisFile), false);
  assert.equal(/from ["'][^"']*search\/engine/.test(thisFile), false);
  assert.equal(/fetch\s*\([^)]*serpapi\.com/i.test(thisFile), false);
});

test("outside_target não entra no enrichment profundo", () => {
  const candidates = selectAgentOneEmailEnrichmentCandidates([
    {
      id: "serp-out",
      company: "East Ltd",
      website: "https://east.co.uk",
      email: null,
      phone: "",
      address: "1 Broadgate, London EC2M 2QS",
      category: "Broker",
      aiScore: 80,
      requestedLocation: WEST,
      locationMatch: "outside_target",
    },
    {
      id: "serp-in",
      company: "West Ltd",
      website: "https://west.co.uk",
      email: null,
      phone: "",
      address: "1 King Street, London W6 0JA",
      category: "Broker",
      aiScore: 80,
      requestedLocation: WEST,
      locationMatch: "verified",
    },
  ]);
  assert.deepEqual(
    candidates.map((lead) => lead.id),
    ["serp-in"]
  );
});

function pnpCampaignLead(id, extras = {}) {
  const email =
    extras.email === undefined ? "hello@" + id + ".co.uk" : extras.email;
  return {
    id,
    company: "Company " + id,
    website: "https://" + id + ".co.uk",
    email,
    phone: "+44 20 7123 4567",
    address: extras.address ?? "12 King Street, London W6 0JA",
    category: "Broker",
    aiScore: 80,
    synthetic: false,
    emailIsGuessed: false,
    emailSourceUrl: email ? "https://" + id + ".co.uk/contact" : null,
    emailDiscoveryMethod: email ? "website_contact" : null,
    emailValidationStatus: "unknown",
    emailValidationReason: "mailbox_not_verified",
    hasMxRecords: true,
    requestedLocation: PNP,
    ...extras,
    email: extras.email === undefined ? email : extras.email,
  };
}

test("verified é elegível geograficamente", () => {
  assert.equal(
    isBatchCampaignEligible(
      pnpCampaignLead("v1", { locationMatch: "verified" })
    ),
    true
  );
});

test("likely é elegível geograficamente", () => {
  assert.equal(
    classifyLocationMatch({
      requestedLocation: PNP,
      address: "High Street, Hammersmith",
    }),
    "likely"
  );
  assert.equal(
    isBatchCampaignEligible(
      pnpCampaignLead("l1", {
        locationMatch: "likely",
        address: "High Street, Hammersmith",
        postcode: null,
      })
    ),
    true
  );
});

test("unknown não é elegível por default e pede revisão", () => {
  assert.equal(DEFAULT_LOCATION_FILTER.includeUnknown, false);
  assert.equal(locationMatchReviewLabel("unknown"), "Revisar localização");
  assert.equal(
    isBatchCampaignEligible(
      pnpCampaignLead("u1", {
        locationMatch: "unknown",
        address: "Somewhere in London",
        postcode: null,
      })
    ),
    false
  );
});

test("checkbox inclui unknown quando explicitamente habilitado", () => {
  const lead = pnpCampaignLead("u2", {
    locationMatch: "unknown",
    address: "Somewhere in London",
    postcode: null,
  });
  assert.equal(
    isBatchCampaignEligible(lead, {
      locationFilter: { ...DEFAULT_LOCATION_FILTER, includeUnknown: true },
      requestedLocation: PNP,
    }),
    true
  );
});

test("outside nunca é elegível, mesmo com auditoria marcada", () => {
  const lead = pnpCampaignLead("out1", {
    locationMatch: "outside_target",
    address: "40 Bank St, Canary Wharf, London E14 5NR",
  });
  assert.equal(isBatchCampaignEligible(lead), false);
  assert.equal(
    isBatchCampaignEligible(lead, {
      locationFilter: {
        includeVerified: true,
        includeLikely: true,
        includeUnknown: true,
        includeOutsideTarget: true,
      },
      requestedLocation: PNP,
    }),
    false
  );
});

test("requested 20 + 21 inside → lote selecionado = 20", () => {
  const leads = [
    ...Array.from({ length: 21 }, (_, i) => ({
      id: "in-" + i,
      locationMatch: "verified",
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: "unk-" + i,
      locationMatch: "unknown",
    })),
    ...Array.from({ length: 37 }, (_, i) => ({
      id: "out-" + i,
      locationMatch: "outside_target",
    })),
  ];
  assert.equal(leads.length, 60);
  const selected = selectOperationalSearchLeads(leads, 20);
  assert.equal(selected.length, 20);
  assert.equal(
    selected.every((lead) => lead.locationMatch === "verified"),
    true
  );
  assert.notEqual(leads.length, selected.length);
});

test("60 analisados não significa 60 selecionados", () => {
  const analyzed = 60;
  const selected = selectOperationalSearchLeads(
    Array.from({ length: analyzed }, (_, i) => ({
      id: "mix-" + i,
      locationMatch: i < 21 ? "verified" : "outside_target",
    })),
    20
  );
  assert.equal(selected.length, 20);
  assert.equal(analyzed === selected.length, false);
});

test("Agent 3 respeita filtro de localização", () => {
  const unknownLead = pnpCampaignLead("a3-unk", {
    locationMatch: "unknown",
    address: "Somewhere in London",
    postcode: null,
  });
  const outsideLead = pnpCampaignLead("a3-out", {
    locationMatch: "outside_target",
    address: "40 Bank St, London E14 5NR",
  });
  const now = "2026-08-24T15:00:00.000Z";
  const blockedUnknown = loadAgentThreeLeads(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "camp-geo-1",
    [unknownLead],
    10,
    now
  );
  assert.equal(blockedUnknown.addedItems[0].exclusionReason, "unknown_location");
  assert.equal(isAgentThreeItemEligible(blockedUnknown.addedItems[0]), false);

  const includedUnknown = loadAgentThreeLeads(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "camp-geo-2",
    [unknownLead],
    10,
    now,
    {
      locationFilter: { ...DEFAULT_LOCATION_FILTER, includeUnknown: true },
    }
  );
  assert.equal(includedUnknown.addedItems[0].exclusionReason, undefined);
  assert.equal(isAgentThreeItemEligible(includedUnknown.addedItems[0]), true);

  const blockedOutside = loadAgentThreeLeads(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "camp-geo-3",
    [outsideLead],
    10,
    now,
    {
      locationFilter: {
        includeVerified: true,
        includeLikely: true,
        includeUnknown: true,
        includeOutsideTarget: true,
      },
    }
  );
  assert.equal(blockedOutside.addedItems[0].exclusionReason, "outside_target");
  assert.equal(isAgentThreeItemEligible(blockedOutside.addedItems[0]), false);
});
