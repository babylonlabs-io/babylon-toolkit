/**
 * CollateralVaultItem Component
 * Renders a single vault card within the expanded collateral view.
 */

import { Avatar } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";
import { truncateHash } from "@/utils/addressUtils";
import { formatBtcAmount, formatDateTime } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

const SECONDS_TO_MS = 1000;

interface CollateralVaultItemProps {
  vaultId: string;
  amountBtc: number;
  addedAt: number;
  status: string;
  vaultProviderName: string;
}

export function CollateralVaultItem({
  vaultId,
  amountBtc,
  addedAt,
  status,
  vaultProviderName,
}: CollateralVaultItemProps) {
  const formattedDate = formatDateTime(new Date(addedAt * SECONDS_TO_MS));

  return (
    <div className="space-y-3 rounded-xl border border-secondary-strokeLight p-4">
      {/* Top row: BTC icon + amount */}
      <div className="flex items-center gap-2">
        <Avatar url={btcConfig.icon} alt={btcConfig.coinSymbol} size="small" />
        <span className="text-base font-medium text-accent-primary">
          {formatBtcAmount(amountBtc)}
        </span>
      </div>

      {/* Date row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Date</span>
        <span className="text-sm text-accent-primary">{formattedDate}</span>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Status</span>
        <span className="flex items-center gap-1.5 text-sm text-accent-primary">
          <span
            className={`inline-block h-2 w-2 rounded-full ${status === "In use" ? "bg-green-500" : "bg-gray-400"}`}
          />
          {status}
        </span>
      </div>

      {/* Vault Provider row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Vault Provider</span>
        <span className="text-sm text-accent-primary">{vaultProviderName}</span>
      </div>

      {/* Transaction hash row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Transaction Hash</span>
        <span className="font-mono text-sm text-accent-primary">
          {truncateHash(vaultId)}
        </span>
      </div>
    </div>
  );
}
