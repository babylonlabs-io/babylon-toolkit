import { useCallback, useSyncExternalStore } from "react";
import type { Address } from "viem";

import {
  getPendingAaveWrite,
  subscribeToPendingAaveWrites,
  type PendingAaveWrite,
} from "../services/pendingAaveWrite";

/**
 * The Aave write `account` is running or still waiting on, read from the
 * app-wide lock (see `pendingAaveWrite.ts`). Null with no account or no write.
 */
export function usePendingAaveWrite(
  account: Address | undefined,
): PendingAaveWrite | null {
  const getSnapshot = useCallback(
    () => (account ? getPendingAaveWrite(account) : null),
    [account],
  );
  return useSyncExternalStore(
    subscribeToPendingAaveWrites,
    getSnapshot,
    getSnapshot,
  );
}
