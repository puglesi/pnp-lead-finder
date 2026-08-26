/**
 * Explicit Agent 3 send timeouts.
 *
 * Live Gmail confirmation on this host completed in ~1s. Defaults stay
 * well above that path but far below nodemailer's 10-minute socket idle.
 * Env overrides are milliseconds and optional.
 */
export const AGENT_THREE_SMTP_CONNECTION_TIMEOUT_MS = 15_000;
export const AGENT_THREE_SMTP_GREETING_TIMEOUT_MS = 15_000;
export const AGENT_THREE_SMTP_SOCKET_TIMEOUT_MS = 30_000;
export const AGENT_THREE_SMTP_OVERALL_TIMEOUT_MS = 45_000;
export const AGENT_THREE_SEND_HTTP_TIMEOUT_MS = 60_000;
export const AGENT_THREE_HEARTBEAT_STALE_MS = 90_000;

export const AGENT_THREE_UNKNOWN_RECONCILIATION_MESSAGE =
  "UNKNOWN_RECONCILIATION_REQUIRED — o SMTP não confirmou o resultado a tempo. Sem retry automático.";

export const AGENT_THREE_STALE_HEARTBEAT_MESSAGE =
  "Envio interrompido — reconciliação necessária";

export class AgentThreeTimeoutError extends Error {
  readonly phase: string;
  readonly timeoutMs: number;

  constructor(phase: string, timeoutMs: number) {
    super("Timeout de " + phase + " após " + timeoutMs + "ms.");
    this.name = "AgentThreeTimeoutError";
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

export function parseTimeoutMs(
  environment: Record<string, string | undefined> | undefined,
  key: string,
  fallback: number
): number {
  const raw = environment?.[key];
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 120_000) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function resolveAgentThreeSmtpTimeouts(
  environment?: Record<string, string | undefined>
) {
  return {
    connectionTimeout: parseTimeoutMs(
      environment,
      "AGENT3_SMTP_CONNECTION_TIMEOUT_MS",
      AGENT_THREE_SMTP_CONNECTION_TIMEOUT_MS
    ),
    greetingTimeout: parseTimeoutMs(
      environment,
      "AGENT3_SMTP_GREETING_TIMEOUT_MS",
      AGENT_THREE_SMTP_GREETING_TIMEOUT_MS
    ),
    socketTimeout: parseTimeoutMs(
      environment,
      "AGENT3_SMTP_SOCKET_TIMEOUT_MS",
      AGENT_THREE_SMTP_SOCKET_TIMEOUT_MS
    ),
    overallTimeout: parseTimeoutMs(
      environment,
      "AGENT3_SMTP_OVERALL_TIMEOUT_MS",
      AGENT_THREE_SMTP_OVERALL_TIMEOUT_MS
    ),
    httpTimeout: parseTimeoutMs(
      environment,
      "AGENT3_SEND_HTTP_TIMEOUT_MS",
      AGENT_THREE_SEND_HTTP_TIMEOUT_MS
    ),
    heartbeatStaleMs: parseTimeoutMs(
      environment,
      "AGENT3_HEARTBEAT_STALE_MS",
      AGENT_THREE_HEARTBEAT_STALE_MS
    ),
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  phase: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new AgentThreeTimeoutError(phase, timeoutMs)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function isAgentThreeHeartbeatStale(
  lastActivityAt: string | null | undefined,
  status: string | null | undefined,
  nowMs = Date.now(),
  staleMs = AGENT_THREE_HEARTBEAT_STALE_MS
): boolean {
  if (status !== "running") return false;
  if (!lastActivityAt) return true;
  const activityMs = Date.parse(lastActivityAt);
  if (!Number.isFinite(activityMs)) return true;
  return nowMs - activityMs > staleMs;
}
