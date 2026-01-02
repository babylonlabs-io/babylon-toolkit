/**
 * CollateralSection Component
 * Displays collateral information with Add/Withdraw buttons
 */

import { Avatar, Button, Loader, SubSection } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";
import { useConnection } from "@/context/wallet";

const btcConfig = getNetworkConfigBTC();

interface PendingContentProps {
  message: string;
}

function PendingContent({ message }: PendingContentProps) {
  return (
    <SubSection className="w-full py-10">
      <div className="flex flex-col items-center justify-center gap-2">
        <Loader size={24} aria-label="Loading status" />
        <p className="text-base text-accent-primary">{message}</p>
      </div>
    </SubSection>
  );
}

interface CollateralContentProps {
  amount?: string;
  usdValue?: string;
}

function CollateralContent({ amount, usdValue }: CollateralContentProps) {
  return (
    <SubSection className="w-full">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">Asset</span>
          <div className="flex items-center gap-2">
            <Avatar
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              size="small"
            />
            <span className="text-base text-accent-primary">
              {btcConfig.coinSymbol}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-secondary">Deposited</span>
          <span className="text-base text-accent-primary">
            {amount} <span className="text-accent-secondary">{usdValue}</span>
          </span>
        </div>
      </div>
    </SubSection>
  );
}

function EmptyContent() {
  return (
    <SubSection className="w-full py-10">
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <p className="text-base text-accent-primary">
          No collateral available.
        </p>
        <p className="text-sm text-accent-secondary">
          Add {btcConfig.coinSymbol} to enable collateral.
        </p>
      </div>
    </SubSection>
  );
}

export interface CollateralSectionProps {
  amount?: string;
  usdValue?: string;
  hasCollateral?: boolean;
  hasAvailableVaults?: boolean;
  isPendingAdd?: boolean;
  isPendingWithdraw?: boolean;
  onAdd: () => void;
  onWithdraw: () => void;
}

export function CollateralSection({
  amount,
  usdValue,
  hasCollateral = false,
  hasAvailableVaults = false,
  isPendingAdd = false,
  isPendingWithdraw = false,
  onAdd,
  onWithdraw,
}: CollateralSectionProps) {
  const { isConnected } = useConnection();
  const isPending = isPendingAdd || isPendingWithdraw;
  const isAddDisabled = !isConnected || !hasAvailableVaults || isPending;
  const showWithdrawButton = hasCollateral && !isPending;

  const renderContent = () => {
    if (isPendingAdd) return <PendingContent message="Pending Add" />;
    if (isPendingWithdraw) return <PendingContent message="Pending Withdrawal" />;
    if (hasCollateral)
      return <CollateralContent amount={amount} usdValue={usdValue} />;
    return <EmptyContent />;
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Collateral
        </h2>
        <div className="flex gap-3">
          <Button
            variant="outlined"
            color="primary"
            size="medium"
            onClick={onAdd}
            disabled={isAddDisabled}
            className="rounded-full"
          >
            Add
          </Button>
          {showWithdrawButton && (
            <Button
              variant="outlined"
              color="primary"
              size="medium"
              onClick={onWithdraw}
              className="rounded-full"
            >
              Withdraw
            </Button>
          )}
        </div>
      </div>
      {renderContent()}
    </div>
  );
}
