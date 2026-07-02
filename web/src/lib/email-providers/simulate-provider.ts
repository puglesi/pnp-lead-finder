import type {
  EmailProvider,
  EmailProviderCredentials,
  EmailSendPayload,
  EmailSendResult,
} from "@/types/email-provider";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const FAILURE_RATE = 0.025;

export const simulateEmailProvider: EmailProvider = {
  id: "simulate",
  name: "Simulação (dev)",

  isConfigured: () => true,

  async send(payload: EmailSendPayload): Promise<EmailSendResult> {
    const start = Date.now();
    await delay(80 + Math.random() * 200);

    if (!payload.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to)) {
      return {
        success: false,
        provider: "simulate",
        errorCode: "INVALID_RECIPIENT",
        errorMessage: `Email inválido: ${payload.to || "(vazio)"}`,
        durationMs: Date.now() - start,
      };
    }

    if (Math.random() < FAILURE_RATE) {
      const codes = [
        { code: "BOUNCE_SIMULATED", msg: "Mailbox unavailable (simulated bounce)" },
        { code: "RATE_LIMIT", msg: "Rate limit exceeded (simulated)" },
        { code: "SMTP_TIMEOUT", msg: "Connection timeout to recipient server" },
      ];
      const pick = codes[Math.floor(Math.random() * codes.length)];
      return {
        success: false,
        provider: "simulate",
        errorCode: pick.code,
        errorMessage: pick.msg,
        durationMs: Date.now() - start,
      };
    }

    return {
      success: true,
      provider: "simulate",
      messageId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      durationMs: Date.now() - start,
    };
  },
};