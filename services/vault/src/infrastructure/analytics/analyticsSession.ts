/**
 * Per-visit identifiers, held in memory only. A reload starts a new visit;
 * nothing goes to cookies or storage.
 */
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

/** Anonymous id for this page load, sent as PostHog's `distinct_id`. */
const visitId = uuidv4();
/** PostHog requires session ids to be UUIDv7. */
const sessionId = uuidv7();

export function getVisitId(): string {
  return visitId;
}

export function getSessionId(): string {
  return sessionId;
}
