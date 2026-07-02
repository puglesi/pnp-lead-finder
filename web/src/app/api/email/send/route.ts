import { sendEmailServer } from "@/lib/email-providers/server-send";
import type {
  EmailProviderCredentials,
  EmailProviderId,
  EmailSendPayload,
} from "@/types/email-provider";
import { NextResponse } from "next/server";

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

    const result = await sendEmailServer(providerId, credentials, payload);
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json(
      { success: false, errorCode: "SERVER_ERROR", errorMessage: message },
      { status: 500 }
    );
  }
}