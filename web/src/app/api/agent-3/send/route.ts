import {
  getServerAgentThreeSmtpAvailability,
  sendServerAgentThreeSmtp,
  verifyServerAgentThreeSmtp,
} from "@/lib/server/agent-three-smtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 7_500_000;

function responseStatus(status: string): number {
  switch (status) {
    case "sent":
    case "connected":
      return 200;
    case "invalid_request":
      return 400;
    case "suppressed":
      return 403;
    case "real_send_disabled":
    case "configuration_error":
    case "authentication_error":
    case "provider_rate_limit":
    case "provider_account_blocked":
      return 503;
    default:
      return 422;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const operation = url.searchParams.get("operation");
  const verify =
    url.searchParams.get("verify") === "1" ||
    url.searchParams.get("verify") === "true";
  const result = verify
    ? await verifyServerAgentThreeSmtp(operation)
    : getServerAgentThreeSmtpAvailability(operation);
  return Response.json(result, {
    status: responseStatus(result.status),
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !Number.isFinite(contentLength) ||
    contentLength < 0 ||
    contentLength > MAX_REQUEST_BYTES
  ) {
    return Response.json(
      {
        status: "invalid_request",
        message: "Dados de envio inválidos.",
      },
      { status: 413 }
    );
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return Response.json(
        {
          status: "invalid_request",
          message: "Dados de envio inválidos.",
        },
        { status: 413 }
      );
    }
    body = JSON.parse(raw) as unknown;
  } catch {
    return Response.json(
      {
        status: "invalid_request",
        message: "Dados de envio inválidos.",
      },
      { status: 400 }
    );
  }

  const result = await sendServerAgentThreeSmtp(body);
  return Response.json(result, {
    status: responseStatus(result.status),
    headers: { "Cache-Control": "no-store" },
  });
}
