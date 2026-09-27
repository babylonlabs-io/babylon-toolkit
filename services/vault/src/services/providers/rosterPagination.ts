/**
 * Ponder defaults collection queries to 50 rows and caps an explicit page at
 * 1,000. Roster tables retain historical versions, so they must always be
 * walked to exhaustion rather than trusting the default page.
 */
export const ROSTER_PAGE_SIZE = 1000;

/** Backstop against a broken cursor that never exhausts. */
export const MAX_ROSTER_PAGES = 50;

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
