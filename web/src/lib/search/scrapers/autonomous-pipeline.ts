import {
  sortSourcesByUkPriority,
  UK_PRIORITY_SOURCES,
  type AutonomousSourceId,
  type AutonomousSourceStrategy,
} from "@/types/autonomous-sources";
import { scrapeCompaniesHouse } from "./companies-house";
import { scrapeGoogleMapsVolume } from "./google-maps";
import {
  scrapeBing,
  scrapeDuckDuckGo,
  scrapeGoogle,
} from "./engines";
import { domainKey, type ScrapedResult } from "./fetch-html";
import {
  scrape192Volume,
  scrapeCylexVolume,
  scrapeFreeIndexVolume,
  scrapeThomsonLocalVolume,
  scrapeTouchLocalVolume,
  scrapeYellVolume,
} from "./uk-directories";

export interface AutonomousPipelineOptions {
  keyword: string;
  location: string;
  sectorIndex?: number;
  maxResults: number;
  sources: AutonomousSourceId[];
  strategy: AutonomousSourceStrategy;
  singleSource?: AutonomousSourceId;
  deepSearch?: boolean;
}

type SourceRunner = (
  query: string,
  keyword: string,
  location: string,
  needed: number,
  deep: boolean
) => Promise<ScrapedResult[]>;

const SOURCE_RUNNERS: Record<AutonomousSourceId, SourceRunner> = {
  "google-maps": async (_q, keyword, location, needed, deep) =>
    scrapeGoogleMapsVolume(keyword, location, needed, deep),
  "google-search": async (query, _k, _l, needed, deep) =>
    scrapeGoogleVolume(query, needed, deep),
  bing: async (query, _k, _l, needed, deep) =>
    scrapeBingVolume(query, needed, deep),
  duckduckgo: async (query, _k, _l, needed, _deep) =>
    scrapeDuckDuckGo(query, Math.min(needed, 50)),
  "companies-house": async (_q, keyword, location, needed, _deep) =>
    scrapeCompaniesHouse(keyword, location, needed),
  yell: async (_q, keyword, location, needed, deep) =>
    scrapeYellVolume(keyword, location, needed, deep),
  "192-com": async (_q, keyword, location, needed, deep) =>
    scrape192Volume(keyword, location, needed, deep),
  "thomson-local": async (_q, keyword, location, needed, deep) =>
    scrapeThomsonLocalVolume(keyword, location, needed, deep),
  freeindex: async (_q, keyword, location, needed, deep) =>
    scrapeFreeIndexVolume(keyword, location, needed, deep),
  "cylex-uk": async (_q, keyword, location, needed, deep) =>
    scrapeCylexVolume(keyword, location, needed, deep),
  touchlocal: async (_q, keyword, location, needed, deep) =>
    scrapeTouchLocalVolume(keyword, location, needed, deep),
};

async function scrapeGoogleVolume(
  query: string,
  needed: number,
  deep: boolean
): Promise<ScrapedResult[]> {
  const collected: ScrapedResult[] = [];
  const pageSize = 40;
  const maxPages = deep ? 8 : 4;
  let offset = 0;

  for (let page = 0; page < maxPages && collected.length < needed; page++) {
    const batch = await scrapeGoogle(
      query,
      Math.min(pageSize, needed - collected.length),
      offset
    );
    if (batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    await new Promise((r) => setTimeout(r, 450));
  }

  return collected;
}

async function scrapeBingVolume(
  query: string,
  needed: number,
  deep: boolean
): Promise<ScrapedResult[]> {
  const collected: ScrapedResult[] = [];
  const pageSize = 40;
  const maxPages = deep ? 8 : 4;
  let offset = 0;

  for (let page = 0; page < maxPages && collected.length < needed; page++) {
    const batch = await scrapeBing(
      query,
      Math.min(pageSize, needed - collected.length),
      offset
    );
    if (batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    await new Promise((r) => setTimeout(r, 450));
  }

  return collected;
}

function sourcePriority(engine: string): number {
  const idx = UK_PRIORITY_SOURCES.indexOf(engine as AutonomousSourceId);
  return idx >= 0 ? idx : UK_PRIORITY_SOURCES.length + 1;
}

function dedupeResults(results: ScrapedResult[]): ScrapedResult[] {
  const seen = new Set<string>();
  const sorted = [...results].sort(
    (a, b) => sourcePriority(a.engine) - sourcePriority(b.engine)
  );
  return sorted.filter((r) => {
    const key = `${r.title.toLowerCase()}|${domainKey(r.url)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveSourceOrder(
  sources: AutonomousSourceId[],
  strategy: AutonomousSourceStrategy,
  sectorIndex: number,
  singleSource?: AutonomousSourceId
): AutonomousSourceId[] {
  const enabled = sortSourcesByUkPriority(
    sources.length > 0 ? sources : (["google-maps"] as AutonomousSourceId[])
  );

  if (strategy === "single") {
    const pick = singleSource && enabled.includes(singleSource)
      ? singleSource
      : enabled[0];
    return [pick];
  }

  if (strategy === "parallel") {
    return [...enabled];
  }

  const start = sectorIndex % enabled.length;
  return [
    enabled[start],
    ...enabled.slice(start + 1),
    ...enabled.slice(0, start),
  ];
}

async function runSource(
  sourceId: AutonomousSourceId,
  keyword: string,
  location: string,
  needed: number,
  deep: boolean
): Promise<ScrapedResult[]> {
  const query = `${keyword} ${location} UK business contact email`;
  try {
    return await SOURCE_RUNNERS[sourceId](query, keyword, location, needed, deep);
  } catch (err) {
    console.warn(`[autonomous/${sourceId}]`, err);
    return [];
  }
}

export async function runAutonomousPipeline(
  options: AutonomousPipelineOptions
): Promise<{
  results: ScrapedResult[];
  sourcesUsed: AutonomousSourceId[];
  primarySource: AutonomousSourceId;
}> {
  const {
    keyword,
    location,
    sectorIndex = 0,
    maxResults,
    sources,
    strategy,
    singleSource,
    deepSearch = false,
  } = options;

  const order = resolveSourceOrder(sources, strategy, sectorIndex, singleSource);
  const sourcesUsed: AutonomousSourceId[] = [];
  const all: ScrapedResult[] = [];

  if (strategy === "parallel") {
    const batches = await Promise.allSettled(
      order.map((sourceId) =>
        runSource(sourceId, keyword, location, maxResults, deepSearch)
      )
    );
    for (let i = 0; i < batches.length; i++) {
      const result = batches[i];
      if (result.status === "fulfilled" && result.value.length > 0) {
        sourcesUsed.push(order[i]);
        all.push(...result.value);
      }
    }
  } else {
    for (const sourceId of order) {
      if (all.length >= maxResults) break;
      const needed = maxResults - all.length;
      const batch = await runSource(
        sourceId,
        keyword,
        location,
        needed,
        deepSearch
      );
      if (batch.length > 0) {
        sourcesUsed.push(sourceId);
        all.push(...batch);
      }
    }
  }

  return {
    results: dedupeResults(all).slice(0, maxResults),
    sourcesUsed,
    primarySource: order[0],
  };
}

/** @deprecated */
export async function scrapeWithRotation(
  keyword: string,
  location: string,
  sectorIndex = 0,
  maxResults = 200
) {
  const r = await runAutonomousPipeline({
    keyword,
    location,
    sectorIndex,
    maxResults,
    sources: ["google-search", "bing", "duckduckgo"],
    strategy: "rotate",
    deepSearch: maxResults > 300,
  });
  return {
    results: r.results,
    enginesUsed: r.sourcesUsed,
    primaryEngine: r.primarySource,
  };
}