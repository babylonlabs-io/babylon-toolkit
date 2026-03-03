/**
 * PendingWithdrawCard Component
 *
 * Renders a single pending withdrawal card with BTC amount and a menu button.
 * Purely presentational — no actions or polling needed for now.
 */

import { Avatar, Card } from "@babylonlabs-io/core-ui";

import { MenuButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { formatBtcAmount } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

interface PendingWithdrawCardProps {
  amountBtc: number;
}

export function PendingWithdrawCard({ amountBtc }: PendingWithdrawCardProps) {
  return (
    <Card variant="filled" className="w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar
            url={btcConfig.icon}
            alt={btcConfig.coinSymbol}
            size="small"
            variant="circular"
          />
          <span className="text-[18px] text-accent-primary/50">
            {formatBtcAmount(amountBtc)}
          </span>
        </div>
        <MenuButton aria-label="Withdraw options" />
      </div>
    </Card>
  );
}
