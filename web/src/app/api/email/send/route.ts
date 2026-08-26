import { sendEmailServer } from "@/lib/email-providers/server-send";
import type {
  EmailProviderCredentials,
  EmailProviderId,
  EmailSendPayload,
} from "@/types/email-provider";
import { NextResponse } from "next/server";
import { getLocalDatabase, type SendIntent } from "@/lib/server/local-database";
import type { AgentThreeSendRequest } from "@/lib/agent-three-smtp-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REAL_PROVIDERS = new Set<EmailProviderId>([
  "mailgun",
  "resend",
  "ses",
  "sendgrid",
  "brevo",
  "smtp-gmail",
  "smtp-outlook",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      providerId?: EmailProviderId;
      credentials?: EmailProviderCredentials;
      payload?: EmailSendPayload;
    };

    const { providerId, credentials, payload } = body;

    if (!providerId || !credentials || !payload) {
      return NextResponse.json(
        { success: false, errorCode: "BAD_REQUEST", errorMessage: "Payload incompleto" },
        { status: 400 }
      );
    }

    if (!REAL_PROVIDERS.has(providerId)) {
      return NextResponse.json(
        {
          success: false,
          provider: providerId,
          errorCode: "UNSUPPORTED",
          errorMessage: "Provedor não suportado para envio real",
        },
        { status: 400 }
      );
    }

    const operation = payload.from.toLowerCase().includes("modeclean")
      ? "modeclean"
      : "panek-puglesi";
    const auditRequest: AgentThreeSendRequest = {
      operation,
      recipient: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      campaignId: payload.campaignId,
      leadId: payload.leadId,
      queueItemId: payload.tags?.join("|"),
    };
    let database: ReturnType<typeof getLocalDatabase>;
    let intent: SendIntent;
    try {
      database = getLocalDatabase();
      intent = database.createSendIntent(auditRequest);
      if (intent.existingMessageId) {
        return NextResponse.json({
          success: true,
          provider: providerId,
          messageId: intent.existingMessageId,
          deduplicated: true,
        });
      }
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          provider: providerId,
          errorCode: "LOCAL_DATABASE_UNAVAILABLE",
          errorMessage:
            "Banco local indisponível — envio real bloqueado antes do provedor. " +
            (error instanceof Error ? error.message : ""),
        },
        { status: 503 }
      );
    }
    const result = await sendEmailServer(providerId, credentials, payload);
    database.finishSendIntent(intent, {
      status: result.success && result.messageId ? "sent" : "permanent_error",
      message: result.errorMessage ?? (result.success ? "E-mail enviado." : "Falha no envio."),
      messageId: result.messageId,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json(
      { success: false, errorCode: "SERVER_ERROR", errorMessage: message },
      { status: 500 }
    );
  }
}
