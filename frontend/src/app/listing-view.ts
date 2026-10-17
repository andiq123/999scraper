export const listingBatchSize = 36;

export function listingLimit(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= listingBatchSize
    ? value
    : listingBatchSize;
}

export function canReuseSearchSnapshot(
  state: { activeQuery: string; searched: boolean } | null,
  query: string | null | undefined,
  alertId: string | null,
): boolean {
  return Boolean(state && !alertId && (!query || (state.searched && query.trim() === state.activeQuery.trim())));
}
