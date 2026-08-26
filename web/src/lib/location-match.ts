import type { LocationMatch } from "../types/lead.ts";
import {
  isAdjacentDistrict,
  isVerifiedDistrict,
  resolveGeoRegion,
  type GeoRegion,
} from "./geo/regions.ts";

export interface LocationFilterOptions {
  includeVerified: boolean;
  includeLikely: boolean;
  includeUnknown: boolean;
  includeOutsideTarget: boolean;
}

export const DEFAULT_LOCATION_FILTER: LocationFilterOptions = {
  includeVerified: true,
  includeLikely: true,
  includeUnknown: false,
  includeOutsideTarget: false,
};

export function shouldApplyGeoLocationFilter(
  requestedLocation: string | null | undefined
): boolean {
  return Boolean(resolveGeoRegion(requestedLocation));
}

/** Campaign/lote geo gate: outside never; unknown only if explicitly included. */
export function isGeographicallyEligible(
  match: LocationMatch | undefined,
  options: LocationFilterOptions = DEFAULT_LOCATION_FILTER
): boolean {
  const value = match ?? "unknown";
  if (value === "outside_target") return false;
  return passesLocationFilter(value, {
    ...options,
    includeOutsideTarget: false,
  });
}

export function locationMatchReviewLabel(
  match: LocationMatch | undefined
): string | null {
  if (match === "unknown") return "Revisar localização";
  if (match === "outside_target") return "Fora da área";
  return null;
}

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/i;

export function extractUkPostcode(address: string | null | undefined): string | null {
  if (!address) return null;
  const match = address.toUpperCase().match(UK_POSTCODE_RE);
  if (!match) return null;
  const outward = match[1].replace(/\s+/g, "");
  const inward = match[0].slice(match[1].length).trim().replace(/\s+/g, "");
  if (!inward) return match[1];
  return `${outward} ${inward}`;
}

export function postcodeDistrict(postcode: string | null | undefined): string | null {
  if (!postcode) return null;
  const match = postcode.toUpperCase().trim().match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return match?.[1] ?? null;
}

function addressMatchesLocality(address: string, region: GeoRegion): boolean {
  const lower = address.toLowerCase();
  return region.localityNames.some((name) => lower.includes(name.toLowerCase()));
}

function coordsInsideBounds(
  region: GeoRegion,
  latitude?: number | null,
  longitude?: number | null
): boolean | null {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return (
    latitude >= region.bounds.minLat &&
    latitude <= region.bounds.maxLat &&
    longitude >= region.bounds.minLng &&
    longitude <= region.bounds.maxLng
  );
}

export function classifyLocationMatch(input: {
  requestedLocation: string;
  address?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  region?: GeoRegion | null;
}): LocationMatch {
  const requested = (input.requestedLocation ?? "").trim();
  const address = (input.address ?? "").trim();
  const postcode = input.postcode ?? extractUkPostcode(address);
  const district = postcodeDistrict(postcode);
  const region = input.region ?? resolveGeoRegion(requested);

  if (region) {
    if (district && isVerifiedDistrict(region, district)) return "verified";
    if (district && isAdjacentDistrict(region, district)) return "likely";
    if (district) return "outside_target";

    if (address && addressMatchesLocality(address, region)) return "likely";
    if (coordsInsideBounds(region, input.latitude, input.longitude) === true) {
      return "likely";
    }
    return "unknown";
  }

  if (!requested) return "unknown";
  const requestedNorm = requested.toLowerCase();
  const placeHint = requestedNorm.split(",")[0]?.trim() ?? "";
  if (address && placeHint && address.toLowerCase().includes(placeHint)) {
    return district ? "verified" : "likely";
  }
  return "unknown";
}

export function passesLocationFilter(
  match: LocationMatch | undefined,
  options: LocationFilterOptions = DEFAULT_LOCATION_FILTER
): boolean {
  const value = match ?? "unknown";
  if (value === "verified") return options.includeVerified;
  if (value === "likely") return options.includeLikely;
  if (value === "unknown") return options.includeUnknown;
  return options.includeOutsideTarget;
}
