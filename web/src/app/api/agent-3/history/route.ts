import { getLocalDatabase } from "@/lib/server/local-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const operation = url.searchParams.get("operation") ?? undefined;
  const campaignId = url.searchParams.get("campaignId") ?? undefined;
  try {
    const database = getLocalDatabase();
    const sends = database.listSendHistory({ operation, campaignId });
    const recoveredCampaigns = database.listRecoveredCampaigns();
    return Response.json(
      { ok: true, sends, recoveredCampaigns },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        sends: [],
        error: error instanceof Error ? error.message : "Histórico indisponível.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
