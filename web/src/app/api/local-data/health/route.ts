import { getLocalDatabase, unavailableLocalDataHealth } from "@/lib/server/local-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = getLocalDatabase();
    const health = database.health();
    return Response.json(health, {
      status: health.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(unavailableLocalDataHealth(error), {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
