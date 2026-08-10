/**
 * Live SMTP preflight (same path as One-Click).
 * - Does NOT send mail
 * - Does NOT print passwords
 * - Uses config presence + transport.verify()
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import {
  getAgentThreeSmtpAvailability,
  verifyAgentThreeSmtpConnection,
} from "../src/lib/server/agent-three-smtp-core.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

function loadEnvLocal(filePath) {
  const env = { ...process.env };
  if (!fs.existsSync(filePath)) return env;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return email ? "[set]" : "[missing]";
  const [user, domain] = email.split("@");
  const maskedUser =
    user.length <= 2
      ? "*".repeat(user.length)
      : `${user[0]}***${user.slice(-1)}`;
  return `${maskedUser}@${domain}`;
}

function sanitizeMessage(message) {
  return String(message || "")
    .replace(/pass(word)?\s*[:=].*/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9+/]{20,}={0,2}\b/g, "[token]");
}

function configPresence(env, prefix) {
  const host = (env[`${prefix}_SMTP_HOST`] || "").trim();
  const port = (env[`${prefix}_SMTP_PORT`] || "").trim();
  const secure = (env[`${prefix}_SMTP_SECURE`] || "").trim();
  const user = (env[`${prefix}_SMTP_USER`] || "").trim();
  const pass = (env[`${prefix}_SMTP_APP_PASSWORD`] || "").trim();
  const fromName = (env[`${prefix}_FROM_NAME`] || "").trim();
  const replyTo = (env[`${prefix}_REPLY_TO`] || "").trim();
  return {
    host: host || "[missing]",
    port: port || "[missing]",
    secure: secure || "[missing]",
    user: maskEmail(user),
    passwordPresent: Boolean(pass),
    passwordLength: pass.length,
    fromNamePresent: Boolean(fromName),
    fromNameChars: fromName.length,
    replyTo: maskEmail(replyTo),
    complete: Boolean(
      host &&
        port &&
        (secure === "true" || secure === "false") &&
        user.includes("@") &&
        pass &&
        fromName &&
        replyTo.includes("@")
    ),
  };
}

const env = loadEnvLocal(envPath);
const createTransport = (options) => {
  const transport = nodemailer.createTransport(options);
  const originalVerify =
    typeof transport.verify === "function"
      ? transport.verify.bind(transport)
      : null;
  transport.verify = async () => {
    if (!originalVerify) return true;
    const started = Date.now();
    try {
      const result = await originalVerify();
      console.log(
        JSON.stringify({
          phase: "smtp-verify-ok",
          host: options.host,
          port: options.port,
          secure: options.secure,
          userDomain: String(options.auth?.user || "").split("@")[1] || null,
          durationMs: Date.now() - started,
        })
      );
      return result;
    } catch (error) {
      const err = error && typeof error === "object" ? error : {};
      console.log(
        JSON.stringify({
          phase: "smtp-verify-fail",
          host: options.host,
          port: options.port,
          durationMs: Date.now() - started,
          code: typeof err.code === "string" ? err.code : null,
          responseCode:
            typeof err.responseCode === "number" ? err.responseCode : null,
          message: sanitizeMessage(
            error instanceof Error ? error.message : String(error)
          ).slice(0, 160),
        })
      );
      throw error;
    }
  };
  // Hard block any accidental real send during this diagnostic.
  transport.sendMail = async () => {
    throw new Error("sendMail blocked in preflight diagnostic");
  };
  return transport;
};

const ops = [
  { id: "panek-puglesi", prefix: "PNP", label: "Panek & Puglesi" },
  { id: "modeclean", prefix: "MODECLEAN", label: "Modeclean" },
];

const endpointBase = process.env.PREFLIGHT_BASE_URL || "http://localhost:3000";

async function probeEndpoint(operation, verify) {
  const url = new URL("/api/agent-3/send", endpointBase);
  url.searchParams.set("operation", operation);
  if (verify) url.searchParams.set("verify", "1");
  const started = Date.now();
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const body = await response.json();
    return {
      ok: true,
      httpStatus: response.status,
      durationMs: Date.now() - started,
      status: body?.status ?? null,
      message: sanitizeMessage(body?.message),
      messageId: body?.messageId ?? null,
      url: url.toString().replace(endpointBase, ""),
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      durationMs: Date.now() - started,
      status: "request_error",
      message: sanitizeMessage(
        error instanceof Error ? error.message : String(error)
      ),
      messageId: null,
      url: url.toString().replace(endpointBase, ""),
    };
  }
}

console.log(
  JSON.stringify(
    {
      AGENT3_REAL_SEND_ENABLED: String(
        env.AGENT3_REAL_SEND_ENABLED || ""
      ).toLowerCase(),
      note: "No sendMail; only config checks + transport.verify(). No providerMessageId.",
    },
    null,
    2
  )
);

const results = [];
for (const op of ops) {
  const presence = configPresence(env, op.prefix);
  const configOnly = getAgentThreeSmtpAvailability(op.id, env);
  const live = await verifyAgentThreeSmtpConnection(op.id, {
    environment: env,
    createTransport,
  });
  const endpointConfig = await probeEndpoint(op.id, false);
  const endpointVerify = await probeEndpoint(op.id, true);

  const row = {
    operation: op.id,
    label: op.label,
    configPresence: presence,
    coreConfigOnly: {
      status: configOnly.status,
      message: sanitizeMessage(configOnly.message),
    },
    coreLiveVerify: {
      status: live.status,
      message: sanitizeMessage(live.message),
      messageId: live.messageId ?? null,
    },
    endpointConfigOnly: endpointConfig,
    endpointLiveVerify: endpointVerify,
    readyForOneClick:
      live.status === "connected" &&
      presence.complete &&
      String(env.AGENT3_REAL_SEND_ENABLED || "").toLowerCase() === "true",
  };
  results.push(row);
  console.log(JSON.stringify(row, null, 2));
}

const allReady = results.every((r) => r.readyForOneClick);
console.log(
  JSON.stringify(
    {
      summary: {
        panekPuglesi: results.find((r) => r.operation === "panek-puglesi"),
        modeclean: results.find((r) => r.operation === "modeclean"),
        oneClickLiberado: allReady,
      },
    },
    null,
    2
  )
);
