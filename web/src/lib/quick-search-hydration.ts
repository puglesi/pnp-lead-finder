export function selectQuickSearchHydrationSnapshot<T>(
  hydrated: boolean,
  persisted: T,
  initial: T
): T {
  return hydrated ? persisted : initial;
}
