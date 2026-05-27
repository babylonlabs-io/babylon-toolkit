import { useEffect, useState } from "react";

import {
  commitBtcDepthStartedAt,
  getBtcDepthStartedAt,
} from "@/utils/btcDepthStartedAt";

/**
 * Stable "Started at" anchor for a vault's BTC confirmation-depth panel.
 * Returns undefined until the first committed render where `active` is true;
 * thereafter returns the anchored timestamp for that vault id, surviving
 * re-mounts and vault switches via the module-level cache. The write goes
 * through useEffect so abandoned/strict-mode renders can't pollute the
 * anchor with a timestamp the user never observed.
 */
export function useBtcDepthStartedAt(
  vaultId: string | undefined,
  active: boolean,
): number | undefined {
  const startedAt = vaultId ? getBtcDepthStartedAt(vaultId) : undefined;
  const [, bump] = useState(0);
  useEffect(() => {
    if (active && vaultId && startedAt === undefined) {
      commitBtcDepthStartedAt(vaultId, Date.now());
      bump((t) => t + 1);
    }
  }, [active, vaultId, startedAt]);
  return startedAt;
}
