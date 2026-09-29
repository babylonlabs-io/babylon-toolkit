/**
 * Ponder defaults collection queries to 50 rows and caps an explicit page at
 * 1,000. Roster tables retain historical versions, so they must always be
 * walked to exhaustion rather than trusting the default page.
 */
export const ROSTER_PAGE_SIZE = 1000;

/** Backstop against a broken cursor that never exhausts. */
export const MAX_ROSTER_PAGES = 50;

export interface RosterPage<T> {
  items: T[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

/**
 * The indexer admitted that more roster rows exist, but the client could not
 * retrieve all of them. Returning the accumulated prefix would make the
 * transaction participant set look authoritative when it is not.
 */
export class IncompleteRosterError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "IncompleteRosterError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validate the pagination envelope returned by the untrusted indexer.
 * TypeScript response types disappear at runtime, so an omitted boolean must
 * not be mistaken for `false` and turn a truncated prefix into a full roster.
 */
export function parseRosterPage<T>(
  response: unknown,
  collectionName: string,
  requestLabel: string,
  isRosterItem: (item: unknown) => item is T,
): RosterPage<T> {
  const collection =
    isRecord(response) && collectionName in response
      ? response[collectionName]
      : undefined;
  const pageInfo = isRecord(collection) ? collection.pageInfo : undefined;
  const items = isRecord(collection) ? collection.items : undefined;

  if (
    !Array.isArray(items) ||
    !isRecord(pageInfo) ||
    typeof pageInfo.hasNextPage !== "boolean" ||
    (pageInfo.endCursor !== null && typeof pageInfo.endCursor !== "string")
  ) {
    throw new IncompleteRosterError(
      `${requestLabel} returned malformed roster pagination metadata; ` +
        `refusing to return an incomplete roster`,
    );
  }

  const malformedItemIndex = items.findIndex((item) => !isRosterItem(item));
  if (malformedItemIndex !== -1) {
    throw new IncompleteRosterError(
      `${requestLabel} returned a malformed roster item at index ` +
        `${malformedItemIndex}; refusing to return an incomplete roster`,
    );
  }

  return {
    items,
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage,
      endCursor: pageInfo.endCursor,
    },
  };
}
