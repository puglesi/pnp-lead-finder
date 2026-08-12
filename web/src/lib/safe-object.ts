/**
 * Safe Object helpers for rehydration / legacy persisted payloads.
 * Never throw on null/undefined — return empty structures instead.
 */

export function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function safeObjectValues<T = unknown>(value: unknown): T[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [];
  return Object.values(value) as T[];
}

export function safeObjectKeys(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [];
  return Object.keys(value);
}

export function safeObjectEntries<T = unknown>(
  value: unknown
): Array<[string, T]> {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [];
  return Object.entries(value) as Array<[string, T]>;
}
