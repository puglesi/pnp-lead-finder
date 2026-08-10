import { NextRequest, NextResponse } from "next/server";
import { executeSearch } from "@/lib/search/engine";
import {
  DEFAULT_LEADS_PER_SECTOR,
  resolveEffectiveMaxResults,
} from "@/lib/search/volume";
import type { SearchProviderType } from "@/types/search";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const keyword = String(body.keyword ?? "").trim();
    const location = String(body.location ?? "").trim();
    const provider = (body.provider ?? "mock") as SearchProviderType;
    const searchProfile =
      body.searchProfile === "autonomous-24h" ? "autonomous-24h" : "serpapi";
    const useMaxLeads = Boolean(body.useMaxLeads);
    const requestedMaxResults =
      Number(body.maxResults) || DEFAULT_LEADS_PER_SECTOR;
    const maxResults =
      body.strictMaxResults === true
        ? Math.min(200, Math.max(1, Math.floor(requestedMaxResults)))
        : resolveEffectiveMaxResults(
            requestedMaxResults,
            useMaxLeads,
            provider,
            searchProfile
          );
    const delayMs = Math.min(5000, Math.max(0, Number(body.delayMs) || 0));

    if (!keyword || !location) {
      return NextResponse.json(
        { error: "keyword e location são obrigatórios" },
        { status: 400 }
      );
    }

    const sectorIndex = Math.max(0, Number(body.sectorIndex) || 0);

    const result = await executeSearch({
      keyword,
      location,
      maxResults,
      strictMaxResults: body.strictMaxResults === true,
      delayMs,
      provider,
      sectorIndex,
      serpApiKey: body.serpApiKey ? String(body.serpApiKey) : undefined,
      googleApiKey: body.googleApiKey ? String(body.googleApiKey) : undefined,
      googleCseId: body.googleCseId ? String(body.googleCseId) : undefined,
      creditExhausted: Boolean(body.creditExhausted),
      serpapiDeepPagination: Boolean(body.serpapiDeepPagination),
      useMaxLeads,
      allowArtificialResults: body.allowArtificialResults !== false,
      autonomousSources: Array.isArray(body.autonomousSources)
        ? body.autonomousSources
        : undefined,
      autonomousSourceStrategy: body.autonomousSourceStrategy,
      autonomousSingleSource: body.autonomousSingleSource,
      autonomousEnrichWebsites:
        body.autonomousEnrichWebsites !== undefined
          ? Boolean(body.autonomousEnrichWebsites)
          : undefined,
    });

    return NextResponse.json({
      keyword,
      location,
      resultsCount: result.leads.length,
      leads: result.leads,
      source: result.source,
      provider: result.provider,
      activeProvider: result.activeProvider,
      isLive: result.isLive,
      resolveReason: result.resolveReason,
      apiCallConsumed: result.apiCallConsumed ?? false,
      apiCallsUsed: result.apiCallsUsed,
      creditExhausted: result.creditExhausted ?? false,
    });
  } catch (err) {
    console.error("[api/search]", err);
    return NextResponse.json(
      { error: "Erro interno na busca" },
      { status: 500 }
    );
  }
}
