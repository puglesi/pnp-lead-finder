/** Fields that must never leave the server env into browser state, URLs or bodies. */
export const CLIENT_FORBIDDEN_SECRET_KEYS = [
  "smtpPassword",
  "serpApiKey",
  "googleApiKey",
  "googleCseId",
  "mailgunApiKey",
  "resendApiKey",
  "sesAccessKey",
  "sesSecretKey",
  "sendgridApiKey",
  "brevoApiKey",
  "password",
  "apiKey",
  "accessKey",
  "secretKey",
  "credentials",
] as const;

const SECRET_KEY_PATTERN =
  /(password|secret|token|credentials|api.?key|smtpPassword|smtpEmail|accessKey|serpApiKey)/i;

export function isClientForbiddenSecretKey(key: string): boolean {
  return (
    CLIENT_FORBIDDEN_SECRET_KEYS.includes(
      key as (typeof CLIENT_FORBIDDEN_SECRET_KEYS)[number]
    ) || SECRET_KEY_PATTERN.test(key)
  );
}

export function stripClientSecrets<T extends Record<string, unknown>>(
  value: T
): T {
  const next = { ...value };
  for (const key of Object.keys(next)) {
    if (isClientForbiddenSecretKey(key)) {
      delete next[key];
    }
  }
  return next;
}

export function collectForbiddenSecretKeys(
  value: unknown,
  found: string[] = []
): string[] {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenSecretKeys(item, found);
    return found;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isClientForbiddenSecretKey(key) && child) found.push(key);
    collectForbiddenSecretKeys(child, found);
  }
  return found;
}

export function payloadContainsClientSecrets(value: unknown): boolean {
  return collectForbiddenSecretKeys(value).length > 0;
}
