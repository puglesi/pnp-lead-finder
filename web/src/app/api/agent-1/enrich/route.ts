import { NextRequest, NextResponse } from "next/server";
import { enrichWebsiteLeadBatch } from "@/lib/search/scrapers/website-enricher";

const MAX_BATCH_SIZE = 8;

interface EnrichmentLeadInput {
  id: string;
  website: string;
}

function parseLeadInput(value: unknown): EnrichmentLeadInput | null {
  if (!value || typeof value !== "object") return null;
  const lead = value as Record<string, unknown>;
  if (typeof lead.id !== "string" || typeof lead.website !== "string") {
    return null;
  }

  const id = lead.id.trim();
  const website = lead.website.trim();
  if (!id || id.length > 240 || !website || website.length > 2_048) {
    return null;
  }

  return { id, website };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { leads?: unknown };
    if (!Array.isArray(body.leads)) {
      return NextResponse.json(
        { error: "leads deve ser uma lista" },
        { status: 400 }
      );
    }

    if (body.leads.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Envie no máximo ${MAX_BATCH_SIZE} leads por lote` },
        { status: 400 }
      );
    }

    const leads = body.leads
      .map(parseLeadInput)
      .filter((lead): lead is EnrichmentLeadInput => lead !== null);

    if (leads.length !== body.leads.length) {
      return NextResponse.json(
        { error: "Um ou mais leads possuem id ou website inválido" },
        { status: 400 }
      );
    }

    const results = await enrichWebsiteLeadBatch(leads, {
      concurrency: MAX_BATCH_SIZE,
    });

    return NextResponse.json({
      results,
      processedCount: results.length,
      emailFoundCount: results.filter((result) => result.email).length,
    });
  } catch (error) {
    console.error("[api/agent-1/enrich]", error);
    return NextResponse.json(
      { error: "Erro interno no enriquecimento de websites" },
      { status: 500 }
    );
  }
}
