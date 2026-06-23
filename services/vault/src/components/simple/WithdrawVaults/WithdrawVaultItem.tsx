/**
 * WithdrawVaultItem Component
 * Selectable vault row rendered inside the Withdraw modal: BTC icon + amount +
 * liquidation ordinal on a filled card, with a trailing selection checkbox.
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
    <div className="flex items-center justify-between rounded-lg bg-primary-contrast px-6 py-4">
      <div className="flex items-center gap-2">
        <Avatar url={btcConfig.icon} alt={btcConfig.coinSymbol} size="medium" />
        <span className="text-xl text-accent-primary">
          {formatBtcAmount(amountBtc)}{" "}
          <span className="text-accent-secondary">
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
