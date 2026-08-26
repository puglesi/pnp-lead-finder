import {
  COMMERCIAL_STORE_KEYS,
  LOCAL_DATA_MIGRATION_VERSION,
  type CommercialStoreKey,
  type LocalDataBridgeSnapshot,
} from "@/types/local-data";
import { getLocalDatabase, unavailableLocalDataHealth } from "@/lib/server/local-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status = 200): ResponseInit {
  return { status, headers: { "Cache-Control": "no-store" } };
}

export async function GET() {
  try {
    const database = getLocalDatabase();
    try {
      await database.ensureDailyBackup();
    } catch {
      // Backup is best-effort; a backup failure must not mark SQLite unavailable.
    }
    return Response.json({ ok: true, data: database.hydration() }, noStore());
  } catch (error) {
    return Response.json(
      { ok: false, error: unavailableLocalDataHealth(error).message },
      noStore(503)
    );
  }
}

export async function POST(request: Request) {
  try {
    const snapshot = await request.json() as LocalDataBridgeSnapshot;
    if (!snapshot || typeof snapshot !== "object") throw new Error("Snapshot inválido.");
    const database = getLocalDatabase();
    await database.createBackup();
    const result = database.mergeLegacySnapshot({
      migrationVersion: Math.max(LOCAL_DATA_MIGRATION_VERSION, Number(snapshot.migrationVersion) || 0),
      stores: snapshot.stores && typeof snapshot.stores === "object" ? snapshot.stores : {},
      indexedDb: {
        signatures: Array.isArray(snapshot.indexedDb?.signatures) ? snapshot.indexedDb.signatures : [],
        searchBatches: Array.isArray(snapshot.indexedDb?.searchBatches) ? snapshot.indexedDb.searchBatches : [],
      },
    });
    return Response.json(
      { ok: true, migrationVersion: LOCAL_DATA_MIGRATION_VERSION, ...result },
      noStore()
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha na migração." },
      noStore(503)
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { storeKey?: CommercialStoreKey; state?: unknown };
    if (!body.storeKey || !COMMERCIAL_STORE_KEYS.includes(body.storeKey)) {
      return Response.json({ ok: false, error: "Store inválido." }, noStore(400));
    }
    const database = getLocalDatabase();
    database.saveCommercialStore(body.storeKey, body.state);
    return Response.json({ ok: true }, noStore());
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Banco local indisponível." },
      noStore(503)
    );
  }
}
