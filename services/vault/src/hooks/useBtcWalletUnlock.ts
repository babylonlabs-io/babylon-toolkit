import { isUserRejectionMessage } from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";

import { useBTCWallet } from "@/context/wallet";
import { logger } from "@/infrastructure";

interface UseBtcWalletUnlockResult {
  /**
   * Surfaces the wallet's unlock / re-authorization prompt via `reconnect()`.
   * On success the provider clears `locked`. Safe to call repeatedly; the
   * in-flight call is tracked by {@link UseBtcWalletUnlockResult.isUnlocking}.
   */
  unlock: () => Promise<void>;
  isUnlocking: boolean;
}

/**
 * Drives the BTC wallet unlock affordance shared by the navbar and the deposit
 * progress view. Re-runs the wallet's connect flow to prompt an unlock and
 * tracks the in-flight state. User rejections (the prompt was dismissed) are
 * expected and not logged; genuine failures are reported with the call-site
 * context.
 *
 * @param logContext - Identifies the call site in error logs.
 */
export function useBtcWalletUnlock(
  logContext: string,
): UseBtcWalletUnlockResult {
  const { reconnect } = useBTCWallet();
  const [isUnlocking, setIsUnlocking] = useState(false);

  const unlock = useCallback(async () => {
    setIsUnlocking(true);
    try {
      await reconnect();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!isUserRejectionMessage(err.message)) {
        logger.error(err, { data: { context: logContext } });
      }
    } finally {
      setIsUnlocking(false);
    }
  }, [reconnect, logContext]);

  return { unlock, isUnlocking };
}
