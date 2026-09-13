import { getLocalDatabase } from "@/lib/server/local-database";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(getLocalDatabase().operationalHealth(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ sqliteOk: false, workerOnline: false, lastError: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
