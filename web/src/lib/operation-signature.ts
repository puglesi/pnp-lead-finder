import type { CampaignSignature } from "../types/campaign.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import { MODECLEAN_DEFAULT_SIGNATURE_HTML } from "./operation-identity.ts";
import { isSignatureHtmlEmpty } from "./signature-html.ts";
import { DEFAULT_SIGNATURE_HTML } from "./signature-template.ts";

export const OPERATION_SIGNATURE_MISMATCH_MESSAGE =
  "Configuração bloqueada: a operação da conta SMTP não corresponde à operação da assinatura.";
export const OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE =
  "Assinatura não configurada. O preflight e o envio desta operação estão bloqueados.";

export interface OperationBoundSignature extends CampaignSignature {
  operation: CampaignProfileId;
}

export function bindSignatureToOperation(
  operation: CampaignProfileId,
  signature: Pick<CampaignSignature, "enabled" | "body">
): OperationBoundSignature {
  return {
    enabled: signature.enabled !== false,
    body: signature.body ?? "",
    operation,
  };
}

/** Identity and completeness guard; it never guesses from brands or HTML. */
export function getOperationSignatureMismatch(
  senderOperation: CampaignProfileId,
  signature: CampaignSignature | null | undefined,
  options: { requireOperationId?: boolean } = {}
): string | null {
  if (!signature?.operation) {
    return options.requireOperationId
      ? OPERATION_SIGNATURE_MISMATCH_MESSAGE
      : isSignatureHtmlEmpty(signature?.body ?? "")
        ? OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE
        : null;
  }
  if (signature.operation !== senderOperation) {
    return OPERATION_SIGNATURE_MISMATCH_MESSAGE;
  }
  return isSignatureHtmlEmpty(signature.body)
    ? OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE
    : null;
}

function removeLiteral(source: string, fragment: string): string {
  if (!fragment.trim() || !source.includes(fragment)) return source;
  return source.split(fragment).join("");
}

export interface LegacySignatureRemovalResult {
  body: string;
  removedOperations: CampaignProfileId[];
}

const LEGACY_EMBEDDED_SIGNATURES: readonly {
  operation: CampaignProfileId;
  html: string;
}[] = [
  { operation: "panek-puglesi", html: DEFAULT_SIGNATURE_HTML },
  { operation: "modeclean", html: MODECLEAN_DEFAULT_SIGNATURE_HTML },
];

/**
 * Removes only exact, known legacy signature fragments from a One-Click
 * template body. Brand mentions, sign-offs and user-authored HTML are kept.
 */
export function removeLegacyEmbeddedOneClickSignatures(
  body: string
): LegacySignatureRemovalResult {
  let nextBody = body;
  const removedOperations: CampaignProfileId[] = [];

  for (const legacy of LEGACY_EMBEDDED_SIGNATURES) {
    const withoutLegacy = removeLiteral(nextBody, legacy.html);
    if (withoutLegacy === nextBody) continue;
    nextBody = withoutLegacy;
    removedOperations.push(legacy.operation);
  }

  if (removedOperations.length > 0) {
    nextBody = nextBody.replace(
      /<div\b[^>]*\bdata-email-signature=(?:"true"|'true')[^>]*>\s*<\/div>/gi,
      ""
    );
  }

  return { body: nextBody, removedOperations };
}
