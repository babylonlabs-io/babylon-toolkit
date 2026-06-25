import { Button, Text } from "@babylonlabs-io/core-ui";
import { isUserRejectionMessage } from "@babylonlabs-io/wallet-connector";
import { useState } from "react";
import { PiWarningOctagonFill } from "react-icons/pi";

import { useBTCWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { logger } from "@/infrastructure";

interface WalletLockedBannerProps {
  visible: boolean;
}

export function WalletLockedBanner({ visible }: WalletLockedBannerProps) {
  const { reconnect } = useBTCWallet();
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async () => {
    setIsUnlocking(true);
    try {
      // Re-runs the wallet's connect flow, which surfaces the extension's
      // unlock prompt. On success the provider clears `locked`; on failure the
      // banner stays so the user can retry.
      await reconnect();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // User rejections are expected (they dismissed the unlock prompt) — only
      // report genuine failures.
      if (!isUserRejectionMessage(err.message)) {
        logger.error(err, { data: { context: "Wallet unlock from banner" } });
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="flex flex-row items-center justify-between gap-2 bg-amber-100 px-4 py-3 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      <div className="flex flex-row items-center gap-2">
        <PiWarningOctagonFill className="flex-shrink-0" />
        <Text variant="body1">
          <strong>{COPY.wallet.locked.title}</strong>
          <br />
          {COPY.wallet.locked.description}
        </Text>
      </div>
      <Button
        variant="contained"
        size="small"
        className="flex-shrink-0"
        onClick={handleUnlock}
        disabled={isUnlocking}
      >
        {isUnlocking
          ? COPY.wallet.locked.unlocking
          : COPY.wallet.locked.unlockButton}
      </Button>
    </div>
  );
}
