import { Loader, Text } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { CopyableHash } from "@/components/shared/CopyableHash";
import { getBtcExplorerTxUrl } from "@/utils/explorer";

/**
 * Expected wall-clock time to a Bitcoin confirmation, in minutes.
 * Mirrors the "(~ 15 min)" copy on the corresponding stepper row; if the
 * actual wait runs longer, the countdown floors at 0.
 */
const EXPECTED_CONFIRMATION_MINUTES = 15;
const TICK_INTERVAL_MS = 30 * 1000;
const MS_PER_MINUTE = 60 * 1000;

interface BtcConfirmationDetailProps {
  /** Date.now() when the AWAIT_BTC_CONFIRMATION step was first entered. */
  startedAt: number;
  /** Raw BTC pegin transaction hash (with or without 0x). */
  peginTxHash: string;
}

function formatStartedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BtcConfirmationDetail({
  startedAt,
  peginTxHash,
}: BtcConfirmationDetailProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const elapsedMinutes = Math.floor((now - startedAt) / MS_PER_MINUTE);
  const remainingMinutes = Math.max(
    0,
    EXPECTED_CONFIRMATION_MINUTES - elapsedMinutes,
  );

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg bg-secondary-highlight p-3">
      <div className="flex items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          Started at:
        </Text>
        <Text as="span" variant="body2" className="text-accent-primary">
          {formatStartedAt(startedAt)}
        </Text>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          Est. Remaining:
        </Text>
        <span className="flex items-center gap-2">
          <Loader size={14} className="text-accent-primary" />
          <Text as="span" variant="body2" className="text-accent-primary">
            ~{remainingMinutes} min
          </Text>
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Text as="span" variant="body2" className="text-accent-secondary">
          Bitcoin TX:
        </Text>
        <CopyableHash
          hash={peginTxHash}
          chain="BTC"
          explorerUrl={getBtcExplorerTxUrl(peginTxHash)}
        />
      </div>
    </div>
  );
}
