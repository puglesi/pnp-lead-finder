import { NextResponse } from "next/server";
import { payloadContainsClientSecrets } from "@/lib/client-secret-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_SEND_DISABLED_MESSAGE =
  "Envio real apenas pelo Agente 3 com credenciais do servidor. O browser não envia senhas nem API keys.";

/**
 * Parallel client-credential send path is disabled.
 * Never accepts client secrets from the browser and never calls SMTP.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    if (payloadContainsClientSecrets(body)) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "CLIENT_SECRETS_REJECTED",
          errorMessage: CLIENT_SEND_DISABLED_MESSAGE,
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        errorCode: "CLIENT_SEND_DISABLED",
        errorMessage: CLIENT_SEND_DISABLED_MESSAGE,
      },
      { status: 409 }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorCode: "CLIENT_SEND_DISABLED",
        errorMessage: CLIENT_SEND_DISABLED_MESSAGE,
      },
      { status: 409 }
    );
  }
}
