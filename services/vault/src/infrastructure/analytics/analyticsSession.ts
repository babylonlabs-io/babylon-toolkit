/**
 * Per-visit identifiers and the connected wallet, held in memory only. A
 * reload starts a new visit; nothing goes to cookies or storage.
 */
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

/** Anonymous id for this page load, sent as PostHog's `distinct_id`. */
const visitId = uuidv4();
/** PostHog requires session ids to be UUIDv7. */
const sessionId = uuidv7();

let walletAddress: string | null = null;

export function getVisitId(): string {
  return visitId;
}

export function getSessionId(): string {
  return sessionId;
}

/** The connected Ethereum address, lowercased, or null when none is connected. */
export function getWalletAddress(): string | null {
  return walletAddress;
}

export function setWalletAddress(address: string | null): void {
  walletAddress = address === null ? null : address.toLowerCase();
}
