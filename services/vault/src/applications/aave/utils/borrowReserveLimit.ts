/**
 * The Spoke caps how many reserves one account may borrow at once. The cap is
 * read from the chain, never assumed: Aave may raise it and the app has to
 * follow without a code change.
 *
 * The cap is per Ethereum account, because the adapter gives each account one
 * position proxy. Every vault deposited under that account shares the position,
 * whichever Bitcoin wallet funded it.
 */

import { MAX_ALLOWED_USER_RESERVES_LIMIT } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

/** The Spoke's cap as the app carries it. `null` is no cap. */
export type BorrowReserveLimit = number | null;

/**
 * The cap as the config delivers it. A failed read is carried, not thrown:
 * only borrowing depends on the cap, so it fails closed on its own while the
 * rest of the app keeps working.
 */
export type BorrowReserveCap =
  | { status: "loaded"; limit: BorrowReserveLimit }
  | { status: "unavailable"; error: Error };

/**
 * Maps the Spoke's raw `MAX_USER_RESERVES_LIMIT` to the app's limit. The
 * contract's unlimited sentinel becomes `null` here and never reaches the UI,
 * so no surface can show "65535" as a number of assets.
 *
 * A cap of 0 would block every borrow and is not a usable protocol value, so
 * it is rejected rather than shown as "Only 0 assets".
 */
export function toBorrowReserveLimit(onChainLimit: number): BorrowReserveLimit {
  if (onChainLimit === 0) {
    throw new Error(
      "The Spoke reports a max user reserves limit of 0, which would block every borrow. Check the Core Spoke's MAX_USER_RESERVES_LIMIT.",
    );
  }
  return onChainLimit === MAX_ALLOWED_USER_RESERVES_LIMIT ? null : onChainLimit;
}

/**
 * The cap a display surface may state. An unavailable cap claims nothing, the
 * same as no cap: display only, never a borrow decision.
 */
export function toDisplayedBorrowReserveLimit(
  cap: BorrowReserveCap,
): BorrowReserveLimit {
  return cap.status === "loaded" ? cap.limit : null;
}

/**
 * Whether the account has used up its borrow reserves. At the cap it can still
 * borrow more of what it already owes, but not a reserve it does not hold.
 *
 * `borrowCount` is the Spoke's own counter (`getUserAccountData`), the one the
 * borrow check compares — not a count derived from the debt positions the app
 * resolved, which can disagree on dust.
 */
export function isAtBorrowReserveLimit(
  limit: BorrowReserveLimit,
  borrowCount: bigint,
): boolean {
  return limit !== null && borrowCount >= BigInt(limit);
}

/**
 * The account's borrow count, or null while it is unknown: the position is
 * still loading or its read failed, and nothing loaded before. A disconnected
 * visitor, or a position that loaded as null, owes nothing: zero.
 */
export function knownBorrowCount({
  position,
  isLoading,
  positionError,
}: {
  position: { accountData: { borrowCount: bigint } } | null | undefined;
  isLoading: boolean;
  positionError: Error | null;
}): bigint | null {
  if (!position && (isLoading || positionError !== null)) return null;
  return position?.accountData.borrowCount ?? 0n;
}
