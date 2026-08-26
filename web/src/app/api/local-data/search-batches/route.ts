import type { Lead } from "@/types/lead";
import type { PersistedSearchBatch } from "@/types/search";
import { getLocalDatabase } from "@/lib/server/local-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const database = getLocalDatabase();
    const url = new URL(request.url);
    const batchId = url.searchParams.get("batchId");
    const all = database.getAllSearchBatches();
    const data = batchId
      ? database.getSearchBatch(batchId)
      : url.searchParams.get("latest") === "1"
        ? all.find((item) =>
            item.batch.status === "running" ||
            item.batch.status === "interrupted" ||
            item.batch.pendingSectors > 0
          ) ?? null
        : all;
    return Response.json({ ok: true, data }, { headers });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Banco indisponível." }, { status: 503, headers });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { batch?: PersistedSearchBatch; leads?: Lead[] };
    if (!body.batch?.batchId) {
      return Response.json({ ok: false, error: "Batch inválido." }, { status: 400, headers });
    }
    getLocalDatabase().putSearchBatch(body.batch, Array.isArray(body.leads) ? body.leads : []);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Banco indisponível." }, { status: 503, headers });
  }
}
