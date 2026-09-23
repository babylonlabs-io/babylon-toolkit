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
type BorrowReserveLimit = number | null;

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
