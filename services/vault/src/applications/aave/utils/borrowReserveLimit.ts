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
 * A borrow refused before signing because the Spoke's cap could not be read.
 * The borrow hook shows its own sentence for it, never this message or the
 * cause, which stays attached for logging.
 */
export class BorrowReserveCapUnavailableError extends Error {
  constructor(options: { cause: Error }) {
    super(
      "Refused to sign a borrow: the Spoke's borrow-reserve cap could not be read",
      options,
    );
    this.name = "BorrowReserveCapUnavailableError";
  }
}

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
 * The reserves the Spoke still counts as borrowed. It clears the borrowing
 * flag at `drawnShares == 0` (Spoke.sol repay), while a debt position survives
 * on a premium-only residue, so the residue must not count here either — the
 * same bitmap backs `getUserAccountData`'s `borrowCount`.
 *
 * Derived in one place because a picker and the pre-sign gate must agree by
 * construction.
 */
export function toBorrowedReserveIds(
  debtPositions?: ReadonlyMap<
    bigint,
    { reserveId: bigint; drawnShares: bigint }
  >,
): Set<bigint> {
  return new Set(
    Array.from(debtPositions?.values() ?? [])
      .filter((debt) => debt.drawnShares > 0n)
      .map((debt) => debt.reserveId),
  );
}

/** What a borrow picker needs to decide which reserves are still selectable. */
export interface BorrowReserveGate {
  limit: BorrowReserveLimit;
  /** The Spoke's own borrow-reserve counter for this account. */
  borrowCount: bigint;
  /** Reserve ids the account currently owes. */
  borrowedReserveIds: ReadonlySet<bigint>;
}

/**
 * Whether a reserve can still be picked in the borrow flow: either the account
 * is below the cap, or this is a reserve it already borrows.
 */
export function isReserveSelectable(
  { limit, borrowCount, borrowedReserveIds }: BorrowReserveGate,
  reserveId: bigint,
): boolean {
  return (
    !isAtBorrowReserveLimit(limit, borrowCount) ||
    borrowedReserveIds.has(reserveId)
  );
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
