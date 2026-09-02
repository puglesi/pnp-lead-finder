import { normalizeEmail } from "./email-validation.ts";
import type { GlobalDeduplicationPreview } from "./global-email-deduplication.ts";

export const PREVIEW_QUEUE_MISMATCH_MESSAGE =
  "A fila ainda não corresponde à prévia authoritative. Reabra o preflight; nenhum envio foi liberado.";

export function eligibilityFingerprint(
  items: readonly { leadId: string; email?: string | null }[]
): string {
  return items
    .map(
      (item) =>
        `${item.leadId}\u0000${normalizeEmail(item.email) ?? ""}`
    )
    .sort()
    .join("\n");
}

export function previewEligibleFingerprint(
  preview: GlobalDeduplicationPreview | null | undefined
): string {
  if (!preview) return "";
  return eligibilityFingerprint(
    preview.decisions
      .filter((decision) => decision.included)
      .map((decision) => ({
        leadId: decision.leadId,
        email: decision.normalizedEmail,
      }))
  );
}

export function queueReadyFingerprint(
  items: readonly {
    leadId: string;
    normalizedEmail?: string | null;
    originalEmail?: string | null;
    queueStatus: string;
  }[]
): string {
  return eligibilityFingerprint(
    items
      .filter((item) => item.queueStatus === "ready")
      .map((item) => ({
        leadId: item.leadId,
        email: item.normalizedEmail ?? item.originalEmail,
      }))
  );
}

export function fingerprintsMatch(
  previewFingerprint: string,
  queueFingerprint: string
): boolean {
  return (
    previewFingerprint.length > 0 &&
    previewFingerprint === queueFingerprint
  );
}
