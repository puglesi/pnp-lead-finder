import type {
  EmailProviderCredentials,
  EmailProviderId,
  EmailSendPayload,
  EmailSendResult,
} from "@/types/email-provider";

const SMTP_PRESETS: Record<
  "smtp-gmail" | "smtp-outlook",
  { host: string; port: number; secure: boolean }
> = {
  "smtp-gmail": { host: "smtp.gmail.com", port: 587, secure: false },
  "smtp-outlook": { host: "smtp-mail.outlook.com", port: 587, secure: false },
};

function fail(
  provider: EmailProviderId,
  code: string,
  message: string,
  start: number
): EmailSendResult {
  return {
    success: false,
    provider,
    errorCode: code,
    errorMessage: message,
    durationMs: Date.now() - start,
  };
}

function ok(
  provider: EmailProviderId,
  messageId: string | undefined,
  start: number
): EmailSendResult {
  return {
    success: true,
    provider,
    messageId,
    durationMs: Date.now() - start,
  };
}

async function sendViaResend(
  credentials: EmailProviderCredentials,
  payload: EmailSendPayload,
  start: number
): Promise<EmailSendResult> {
  const apiKey = credentials.resendApiKey?.trim();
  if (!apiKey) return fail("resend", "NOT_CONFIGURED", "Resend API key ausente", start);

  const body: Record<string, unknown> = {
    from: `${payload.fromName} <${payload.from}>`,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html,
    reply_to: payload.replyTo || undefined,
    text: payload.text,
  };

  if (payload.attachments?.length) {
    body.attachments = payload.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };

  if (!res.ok) {
    return fail(
      "resend",
      `RESEND_${res.status}`,
      data.message ?? `Resend HTTP ${res.status}`,
      start
    );
  }

  return ok("resend", data.id, start);
}

async function sendViaMailgun(
  credentials: EmailProviderCredentials,
  payload: EmailSendPayload,
  start: number
): Promise<EmailSendResult> {
  const apiKey = credentials.mailgunApiKey?.trim();
  const domain = credentials.mailgunDomain?.trim();
  if (!apiKey || !domain) {
    return fail("mailgun", "NOT_CONFIGURED", "Mailgun API key ou domínio ausente", start);
  }

  const form = new FormData();
  form.append("from", `${payload.fromName} <${payload.from}>`);
  form.append("to", payload.to);
  form.append("subject", payload.subject);
  form.append("html", payload.html);
  if (payload.text) form.append("text", payload.text);
  if (payload.replyTo) form.append("h:Reply-To", payload.replyTo);

  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
    },
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };

  if (!res.ok) {
    return fail(
      "mailgun",
      `MAILGUN_${res.status}`,
      data.message ?? `Mailgun HTTP ${res.status}`,
      start
    );
  }

  return ok("mailgun", data.id, start);
}

async function sendViaSendGrid(
  credentials: EmailProviderCredentials,
  payload: EmailSendPayload,
  start: number
): Promise<EmailSendResult> {
  const apiKey = credentials.sendgridApiKey?.trim();
  if (!apiKey) {
    return fail("sendgrid", "NOT_CONFIGURED", "SendGrid API key ausente", start);
  }

  const body = {
    personalizations: [{ to: [{ email: payload.to, name: payload.toName }] }],
    from: { email: payload.from, name: payload.fromName },
    reply_to: payload.replyTo ? { email: payload.replyTo } : undefined,
    subject: payload.subject,
    content: [
      ...(payload.text ? [{ type: "text/plain", value: payload.text }] : []),
      { type: "text/html", value: payload.html },
    ],
    attachments: payload.attachments?.map((a) => ({
      filename: a.filename,
      type: a.mimeType,
      content: a.content,
    })),
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return fail("sendgrid", `SENDGRID_${res.status}`, text || `SendGrid HTTP ${res.status}`, start);
  }

  const messageId = res.headers.get("x-message-id") ?? undefined;
  return ok("sendgrid", messageId, start);
}

async function sendViaBrevo(
  credentials: EmailProviderCredentials,
  payload: EmailSendPayload,
  start: number
): Promise<EmailSendResult> {
  const apiKey = credentials.brevoApiKey?.trim();
  if (!apiKey) return fail("brevo", "NOT_CONFIGURED", "Brevo API key ausente", start);

  const body = {
    sender: { name: payload.fromName, email: payload.from },
    to: [{ email: payload.to, name: payload.toName }],
    replyTo: payload.replyTo ? { email: payload.replyTo } : undefined,
    subject: payload.subject,
    htmlContent: payload.html,
    textContent: payload.text,
    attachment: payload.attachments?.map((a) => ({
      name: a.filename,
      content: a.content,
    })),
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    messageId?: string;
    message?: string;
  };

  if (!res.ok) {
    return fail(
      "brevo",
      `BREVO_${res.status}`,
      data.message ?? `Brevo HTTP ${res.status}`,
      start
    );
  }

  return ok("brevo", data.messageId, start);
}

async function sendViaSes(
  credentials: EmailProviderCredentials,
  payload: EmailSendPayload,
  start: number
): Promise<EmailSendResult> {
  const accessKey = credentials.sesAccessKey?.trim();
  const secretKey = credentials.sesSecretKey?.trim();
  const region = credentials.sesRegion?.trim() || "eu-west-1";
  if (!accessKey || !secretKey) {
    return fail("ses", "NOT_CONFIGURED", "Credenciais Amazon SES ausentes", start);
  }

  try {
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
    const client = new SESClient({
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    const result = await client.send(
      new SendEmailCommand({
        Source: `${payload.fromName} <${payload.from}>`,
        Destination: { ToAddresses: [payload.to] },
        ReplyToAddresses: payload.replyTo ? [payload.replyTo] : undefined,
        Message: {
          Subject: { Data: payload.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: payload.html, Charset: "UTF-8" },
            ...(payload.text
              ? { Text: { Data: payload.text, Charset: "UTF-8" } }
              : {}),
          },
        },
      })
    );

    return ok("ses", result.MessageId, start);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha no Amazon SES";
    return fail("ses", "SES_ERROR", message, start);
  }
}

async function sendViaSmtp(
  providerId: "smtp-gmail" | "smtp-outlook",
  credentials: EmailProviderCredentials,
  payload: EmailSendPayload,
  start: number
): Promise<EmailSendResult> {
  const email = credentials.smtpEmail?.trim();
  const password = credentials.smtpPassword?.trim();
  if (!email || !password) {
    return fail(providerId, "NOT_CONFIGURED", "Email ou senha de app SMTP ausente", start);
  }

  const preset = SMTP_PRESETS[providerId];

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      auth: { user: email, pass: password },
    });

    const info = await transporter.sendMail({
      from: `"${payload.fromName}" <${payload.from || email}>`,
      to: payload.to,
      replyTo: payload.replyTo || email,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      attachments: payload.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
        contentType: a.mimeType,
      })),
    });

    return ok(providerId, info.messageId, start);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha SMTP";
    return fail(providerId, "SMTP_ERROR", message, start);
  }
}

export async function sendEmailServer(
  providerId: EmailProviderId,
  credentials: EmailProviderCredentials,
  payload: EmailSendPayload
): Promise<EmailSendResult> {
  const start = Date.now();

  if (!payload.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to)) {
    return fail(providerId, "INVALID_RECIPIENT", `Email inválido: ${payload.to || "(vazio)"}`, start);
  }

  switch (providerId) {
    case "resend":
      return sendViaResend(credentials, payload, start);
    case "mailgun":
      return sendViaMailgun(credentials, payload, start);
    case "sendgrid":
      return sendViaSendGrid(credentials, payload, start);
    case "brevo":
      return sendViaBrevo(credentials, payload, start);
    case "ses":
      return sendViaSes(credentials, payload, start);
    case "smtp-gmail":
    case "smtp-outlook":
      return sendViaSmtp(providerId, credentials, payload, start);
    default:
      return fail(
        providerId,
        "UNSUPPORTED_PROVIDER",
        `Provedor ${providerId} não suporta envio real no servidor`,
        start
      );
  }
}