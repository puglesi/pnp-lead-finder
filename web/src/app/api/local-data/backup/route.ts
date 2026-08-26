import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { getLocalDatabase } from "@/lib/server/local-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const path = await getLocalDatabase().createBackup();
    return Response.json({ ok: true, fileName: basename(path), path }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Falha no backup." }, { status: 503 });
  }
}

export async function GET() {
  try {
    const path = await getLocalDatabase().createBackup();
    return new Response(readFileSync(path), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": "attachment; filename=" + JSON.stringify(basename(path)),
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Falha na exportação." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  let temporaryPath: string | null = null;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength < 512 || bytes.byteLength > 2_000_000_000) {
      return Response.json({ ok: false, error: "Arquivo SQLite inválido." }, { status: 400 });
    }
    const database = getLocalDatabase();
    temporaryPath = resolve(database.backupDirectory, ".restore-upload-" + crypto.randomUUID() + ".sqlite");
    if (dirname(temporaryPath) !== resolve(database.backupDirectory)) throw new Error("Destino temporário inválido.");
    writeFileSync(temporaryPath, bytes);
    const preRestoreBackup = await database.restoreFromFile(temporaryPath);
    return Response.json({ ok: true, preRestoreBackup, data: database.hydration() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Falha no restore." }, { status: 422 });
  } finally {
    if (temporaryPath) {
      try {
        rmSync(temporaryPath);
      } catch {
        // Arquivo pode já ter sido removido.
      }
    }
  }
}
