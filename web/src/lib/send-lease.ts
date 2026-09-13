export const SEND_LEASE_TTL_MS = 120_000;

export type SendLeaseStatus =
  | "claimed"
  | "confirmed"
  | "failed"
  | "unknown";

export type SendLeaseDecision =
  | "claimed"
  | "already_sent"
  | "already_claimed"
  | "reconciliation_required";

export type SendContactKind = "first_contact" | "follow_up";

export function normalizeSendContactKind(
  value: unknown
): SendContactKind {
  return value === "follow_up" ? "follow_up" : "first_contact";
}

export function normalizeLeaseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function buildSendLeaseKey(
  operation: string,
  email: string,
  contactKind: unknown = "first_contact"
): string {
  return [
    operation,
    normalizeLeaseEmail(email),
    normalizeSendContactKind(contactKind),
  ].join("|");
}

export function isSendLeaseExpired(
  expiresAt: string | null | undefined,
  nowIso: string
): boolean {
  if (!expiresAt) return true;
  return expiresAt <= nowIso;
}

export function decideSendLeaseClaim(input: {
  confirmedMessageId?: string | null;
  leaseStatus?: SendLeaseStatus | null;
  leaseOwnerId?: string | null;
  leaseExpiresAt?: string | null;
  requesterOwnerId: string;
  nowIso: string;
}): SendLeaseDecision {
  if (input.confirmedMessageId) return "already_sent";
  if (input.leaseStatus === "confirmed") return "already_sent";
  if (input.leaseStatus === "unknown") return "reconciliation_required";
  if (input.leaseStatus === "claimed") {
    if (isSendLeaseExpired(input.leaseExpiresAt, input.nowIso)) {
      return "reconciliation_required";
    }
    return "already_claimed";
  }
  return "claimed";
}
