/**
 * WithdrawVaultItem Component
 * Compact, selectable vault row rendered inside the Withdraw modal: BTC icon +
 * amount + liquidation ordinal, with a trailing selection checkbox.
 */

import { Avatar, Checkbox } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";
import { formatBtcAmount, formatOrdinal } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

interface WithdrawVaultItemProps {
  vaultId: string;
  amountBtc: number;
  /** 1-based liquidation priority shown as an ordinal, e.g. "1st". */
  position: number;
  selected: boolean;
  selectable: boolean;
  onToggleSelect: (vaultId: string) => void;
}

export function WithdrawVaultItem({
  vaultId,
  amountBtc,
  position,
  selected,
  selectable,
  onToggleSelect,
}: WithdrawVaultItemProps) {
  const canInteract = selectable || selected;
  const handleToggle = () => {
    if (canInteract) onToggleSelect(vaultId);
  };

  return (
    <div className="flex items-center justify-between rounded-xl border border-secondary-strokeLight p-3">
      <div className="flex items-center gap-3">
        <Avatar url={btcConfig.icon} alt={btcConfig.coinSymbol} size="small" />
        <span className="text-base font-medium text-accent-primary">
          {formatBtcAmount(amountBtc)}{" "}
          <span className="text-sm text-accent-secondary">
            ({formatOrdinal(position)})
          </span>
        </span>
      </div>
      <Checkbox
        checked={selected}
        onChange={handleToggle}
        disabled={!canInteract}
        variant="default"
        showLabel={false}
      />
    </div>
  );
}
