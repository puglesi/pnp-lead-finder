export interface GeoRegion {
  id: string;
  /** User-facing region name, e.g. "P&P Target Area". */
  name: string;
  /** Optional geographic gloss shown in the UI. */
  displaySubtitle?: string;
  /** Strings that match the user's requested location. */
  labels: string[];
  /** Phrase used in provider queries (Maps-recognisable). */
  queryLocationPhrase: string;
  /** Label for in-area counts in search audit UI. */
  auditInsideLabel: string;
  /** Google Maps SerpAPI `ll` (@lat,lng,zoom). */
  mapsLl: string;
  /** Inclusive geographic hint when a postcode is missing. */
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  /** Postcode districts that count as verified for this region. */
  verifiedDistricts: string[];
  /** Neighbouring districts that count as likely. */
  adjacentDistricts: string[];
  /** Place-name tokens that support a likely match without a postcode. */
  localityNames: string[];
}

export const PNP_TARGET_AREA_ID = "pnp-target-area";
export const DEFAULT_GEO_SEARCH_LOCATION = "P&P Target Area";

/**
 * Editable geographic targets used by search, classification and UI.
 * Add/adjust regions here — do not scatter district lists in providers.
 */
export const GEO_REGIONS: readonly GeoRegion[] = [
  {
    id: PNP_TARGET_AREA_ID,
    name: "P&P Target Area",
    displaySubtitle: "West & South West London",
    labels: [
      "p&p target area",
      "pnp target area",
      "p and p target area",
      "west london",
      "west london uk",
      "west london, uk",
      "west london, united kingdom",
      "west & south west london",
      "west and south west london",
    ],
    queryLocationPhrase: "West and South West London",
    auditInsideLabel: "Dentro da área P&P",
    mapsLl: "@51.48,-0.22,11z",
    bounds: {
      minLat: 51.425,
      maxLat: 51.555,
      minLng: -0.385,
      maxLng: -0.11,
    },
    verifiedDistricts: [
      "W1",
      "W2",
      "W3",
      "W4",
      "W5",
      "W6",
      "W7",
      "W8",
      "W9",
      "W10",
      "W11",
      "W12",
      "W13",
      "W14",
      "NW10",
      "TW1",
      "TW2",
      "TW7",
      "TW8",
      "TW9",
      "TW10",
      "TW11",
      "SW1",
      "SW3",
      "SW4",
      "SW5",
      "SW6",
      "SW7",
      "SW8",
      "SW9",
      "SW10",
      "SW11",
      "SW13",
      "SW14",
      "SW15",
      "SW18",
    ],
    adjacentDistricts: [],
    localityNames: [
      "west london",
      "south west london",
      "southwest london",
      "ealing",
      "acton",
      "chiswick",
      "hammersmith",
      "fulham",
      "shepherd's bush",
      "shepherds bush",
      "white city",
      "holland park",
      "notting hill",
      "ladbroke grove",
      "hanwell",
      "west kensington",
      "barons court",
      "gunnersbury",
      "kensington",
      "paddington",
      "bayswater",
      "maida vale",
      "little venice",
      "westbourne park",
      "queen's park",
      "queens park",
      "mayfair",
      "soho",
      "marylebone",
      "fitzrovia",
      "westminster",
      "victoria",
      "pimlico",
      "belgravia",
      "st james",
      "st. james",
      "chelsea",
      "knightsbridge",
      "south kensington",
      "earl's court",
      "earls court",
      "parsons green",
      "wandsworth",
      "putney",
      "roehampton",
      "battersea",
      "clapham",
      "stockwell",
      "brixton",
      "nine elms",
      "vauxhall",
      "barnes",
      "mortlake",
      "east sheen",
      "brentford",
      "kew",
      "richmond",
      "twickenham",
      "teddington",
      "isleworth",
      "st margarets",
      "st. margarets",
      "whitton",
      "willesden",
      "harlesden",
      "park royal",
      "neasden",
      "kensal green",
      "kensal rise",
    ],
  },
];

function normalizeLocationLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/united kingdom/g, "uk")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveGeoRegion(
  requestedLocation: string | null | undefined
): GeoRegion | null {
  const normalized = normalizeLocationLabel(requestedLocation ?? "");
  if (!normalized) return null;
  return (
    GEO_REGIONS.find((region) =>
      region.labels.some((label) => {
        const wanted = normalizeLocationLabel(label);
        return normalized === wanted || normalized.includes(wanted);
      })
    ) ?? null
  );
}

/**
 * Strip the extra letter used by London W1/SW1 subdistricts.
 * W1A → W1, SW1X → SW1, W10 → W10, NW10 → NW10.
 */
export function canonicalPostcodeDistrict(district: string): string {
  const upper = district.toUpperCase().replace(/\s+/g, "");
  const match = upper.match(/^([A-Z]{1,2}\d+)([A-Z])?$/);
  if (!match) return upper;
  return match[1];
}

function districtConfigured(
  configured: readonly string[],
  district: string
): boolean {
  const upper = district.toUpperCase().replace(/\s+/g, "");
  const canonical = canonicalPostcodeDistrict(upper);
  return configured.some((entry) => {
    const wanted = entry.toUpperCase().replace(/\s+/g, "");
    return wanted === upper || wanted === canonical;
  });
}

export function isVerifiedDistrict(
  region: GeoRegion,
  district: string
): boolean {
  return districtConfigured(region.verifiedDistricts, district);
}

export function isAdjacentDistrict(
  region: GeoRegion,
  district: string
): boolean {
  return districtConfigured(region.adjacentDistricts, district);
}

export function buildProviderLocationQuery(
  keyword: string,
  location: string
): { q: string; ll?: string } {
  const region = resolveGeoRegion(location);
  const phrase = (region?.queryLocationPhrase ?? location)
    .replace(/,?\s*UK$/i, "")
    .replace(/,?\s*United Kingdom$/i, "")
    .trim();
  return {
    q: `${keyword.trim()} in ${phrase}`,
    ll: region?.mapsLl,
  };
}

export function getRegionAuditLabels(region: GeoRegion | null): {
  inside: string;
  outside: string;
  unknown: string;
} {
  return {
    inside: region?.auditInsideLabel ?? "Na área",
    outside: "Fora da área",
    unknown: "Localização desconhecida",
  };
}

export function formatRegionHeading(region: GeoRegion | null): string | null {
  if (!region) return null;
  if (region.displaySubtitle) {
    return `${region.name} · ${region.displaySubtitle}`;
  }
  return region.name;
}
