import { getLocalDatabase } from "@/lib/server/local-database";
import { normalizeAgentThreeSnapshot } from "@/lib/agent-three-queue";
import { isCampaignProfileId } from "@/types/campaign-profile";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  // Local control endpoint rejects cross-origin browser requests.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  try {
    const body = await request.json();
    const operation = body?.operation;
    if ((!isCampaignProfileId(operation) && operation !== "agent-1" && operation !== "agent-2")
      || !["running", "paused"].includes(body?.desiredState)) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const database = getLocalDatabase();
    const health = database.operationalHealth();
    if (!health.workerOnline || health.workerMode !== "execute") return Response.json({ error: "EXECUTING_WORKER_REQUIRED" }, { status: 409 });
    if (body.desiredState === "running" && isCampaignProfileId(operation)) {
      const state = normalizeAgentThreeSnapshot(database.readCommercialStore("pnp-agent-three"), true).operations[operation];
      if (state.queue.some(item => ["unknown", "sending"].includes(item.queueStatus)) || !state.queue.some(item => item.campaignId === state.currentCampaignId && item.queueStatus === "ready"))
        return Response.json({ error: "RECONCILIATION_OR_READY_QUEUE_REQUIRED" }, { status: 409 });
      if (database.operationCooldowns(operation).some(row => row.paused)) return Response.json({ error: "SMTP_REVIEW_REQUIRED" }, { status: 409 });
    }
    database.setWorkerControl(operation, body.desiredState);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "CONTROL_UNAVAILABLE" }, { status: 503 }); }
}
