import type { AgentThreeSmtpResult } from "./agent-three-smtp-contract.ts";
export function smtpBackoff(result: AgentThreeSmtpResult, failures: number, now = Date.now(), ceilingMs = 300_000) {
  if (result.status === "sent" || result.messageId) return { classification: "CONFIRMED", paused: false, failures: 0, untilAt: null };
  if (["authentication_error", "provider_account_blocked"].includes(result.status))
    return { classification: "AUTH_PERMANENT", paused: true, failures: failures + 1, untilAt: null };
  if (["connection_error", "reconciliation_required"].includes(result.status))
    return { classification: "RECONCILIATION_REQUIRED", paused: true, failures: failures + 1, untilAt: null };
  if (["auth_transient", "provider_rate_limit", "transient_error"].includes(result.status)) {
    const count = failures + 1;
    const schedule = [30_000, 60_000, 120_000, 300_000];
    const ceiling = Number.isFinite(ceilingMs) ? ceilingMs : 300_000;
    const delay = Math.min(Math.max(1_000, ceiling), schedule[Math.min(count - 1, 3)]);
    return { classification: "TRANSIENT", paused: false, failures: count, untilAt: new Date(now + delay).toISOString() };
  }
  return { classification: result.status.toUpperCase(), paused: false, failures, untilAt: null };
}
