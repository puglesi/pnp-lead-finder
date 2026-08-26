import type { OfficialSignatureRecord } from "@/lib/operation-signature-repository";
import { getLocalDatabase } from "@/lib/server/local-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const operation = new URL(request.url).searchParams.get("operation");
    const database = getLocalDatabase();
    const data = operation ? database.getSignature(operation) : database.getSignatures();
    return Response.json({ ok: true, data }, { headers });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Banco indisponível." }, { status: 503, headers });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { records?: OfficialSignatureRecord[] };
    const records = Array.isArray(body.records) ? body.records : [];
    getLocalDatabase().putSignatures(records);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Banco indisponível." }, { status: 503, headers });
  }
}
