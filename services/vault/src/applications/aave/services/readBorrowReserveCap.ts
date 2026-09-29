/**
 * Reads the Spoke's borrow-reserve cap for the Aave config.
 *
 * A failed read is carried as `unavailable` rather than thrown: only borrowing
 * needs the cap, so it fails closed on that state while the rest of the config
 * stays usable.
 */

import type { Address } from "viem";

import { calculateRetryDelay, shouldRetry } from "../../../config/queryClient";
import { getMaxUserReservesLimit } from "../clients/spoke";
import {
  toBorrowReserveLimit,
  type BorrowReserveCap,
} from "../utils/borrowReserveLimit";

/**
 * The cap read, retried on the app's query policy (`shouldRetry` and its
 * backoff), which is the only limit. A failure no longer fails the config
 * query, so React Query no longer retries it; this keeps a transient RPC error
 * from disabling borrowing until a reload.
 */
async function readMaxUserReservesLimitWithRetry(
  coreSpokeAddress: Address,
): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getMaxUserReservesLimit(coreSpokeAddress);
    } catch (error) {
      if (!(error instanceof Error) || !shouldRetry(attempt, error)) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, calculateRetryDelay(attempt)),
      );
    }
  }
}

/**
 * Never rejects: a read that still fails after its retries, or a value the app
 * cannot use, comes back as `unavailable` with an error naming the Spoke.
 */
export async function readBorrowReserveCap(
  coreSpokeAddress: Address,
): Promise<BorrowReserveCap> {
  try {
    return {
      status: "loaded",
      limit: toBorrowReserveLimit(
        await readMaxUserReservesLimitWithRetry(coreSpokeAddress),
      ),
    };
  } catch (error) {
    return {
      status: "unavailable",
      error: new Error(
        `Failed to read the max user reserves limit from Core Spoke ${coreSpokeAddress}`,
        { cause: error },
      ),
    };
  }
}
