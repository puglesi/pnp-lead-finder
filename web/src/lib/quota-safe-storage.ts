import type { StateStorage } from "zustand/middleware";

const QUOTA_ERROR_NAMES = new Set([
  "QuotaExceededError",
  "NS_ERROR_DOM_QUOTA_REACHED",
]);

/** Browser persistence is only a cache; exhausting it must never stop the app. */
export function isStorageQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return (
    (typeof candidate.name === "string" &&
      QUOTA_ERROR_NAMES.has(candidate.name)) ||
    candidate.code === 22 ||
    candidate.code === 1014
  );
}

export function setStorageItemWithoutQuotaFailure(
  storage: Pick<StateStorage, "setItem">,
  key: string,
  value: string
): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) throw error;
    return false;
  }
}

export function createQuotaSafeStateStorage(
  storage: StateStorage
): StateStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      setStorageItemWithoutQuotaFailure(storage, key, value);
    },
    removeItem: (key) => storage.removeItem(key),
  };
}
