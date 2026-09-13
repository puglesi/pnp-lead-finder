import { getLocalDatabase } from "@/lib/server/local-database";
import { isCampaignProfileId } from "@/types/campaign-profile";
import { AGENT_THREE_SMTP_MESSAGES } from "@/lib/agent-three-smtp-contract";
import { RUNNER_ALREADY_ACTIVE_MESSAGE } from "@/lib/runner-lease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status = 200): ResponseInit {
  return { status, headers: { "Cache-Control": "no-store" } };
}

export async function POST(request: Request) {
  let body: {
    action?: string;
    operation?: string;
    ownerId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { ok: false, status: "invalid_request", message: "Dados inválidos." },
      noStore(400)
    );
  }
  const operation = body.operation;
  const ownerId = typeof body.ownerId === "string" ? body.ownerId.trim() : "";
  const action = body.action;
  if ((!isCampaignProfileId(operation) && operation !== "agent-1" && operation !== "agent-2") || !ownerId) {
    return Response.json(
      { ok: false, status: "invalid_request", message: "operation e ownerId obrigatórios." },
      noStore(400)
    );
  }
  try {
    const database = getLocalDatabase();
    if (action === "release") {
      database.releaseRunnerLease(operation, ownerId);
      return Response.json({ ok: true, status: "released" }, noStore());
    }
    if (action === "heartbeat") {
      const beat = database.heartbeatRunnerLease(operation, ownerId);
      if (!beat.ok) {
        return Response.json(
          {
            ok: false,
            status: "runner_already_active",
            message: RUNNER_ALREADY_ACTIVE_MESSAGE,
          },
          noStore(409)
        );
      }
      return Response.json({ ok: true, status: "claimed" }, noStore());
    }
    if (action !== "claim") {
      return Response.json(
        { ok: false, status: "invalid_request", message: "Ação inválida." },
        noStore(400)
      );
    }
    const claimed = database.claimRunnerLease(operation, ownerId);
    if (claimed.decision === "already_active") {
      return Response.json(
        {
          ok: false,
          status: "runner_already_active",
          message: AGENT_THREE_SMTP_MESSAGES.runner_already_active,
        },
        noStore(409)
      );
    }
    return Response.json({ ok: true, status: "claimed" }, noStore());
  } catch (error) {
    return Response.json(
      {
        ok: false,
        status: "configuration_error",
        message:
          "Banco local indisponível. " +
          (error instanceof Error ? error.message : ""),
      },
      noStore(503)
    );
  }
}
