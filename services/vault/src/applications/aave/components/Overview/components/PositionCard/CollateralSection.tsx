/**
 * CollateralSection Component
 * Displays collateral information with Add/Withdraw buttons
 */

import { Avatar, Button, Loader, SubSection } from "@babylonlabs-io/core-ui";

function PendingContent() {
  return (
    <SubSection className="w-full py-10">
      <div className="flex flex-col items-center justify-center gap-2">
        <Loader size={24} />
        <p className="text-base text-accent-primary">Pending Deposit</p>
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
              url="https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400"
              alt="BTC"
              size="small"
            />
            <span className="text-base text-accent-primary">BTC</span>
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
          Add BTC to enable collateral.
        </p>
      </div>
    </SubSection>
  );
}

export interface CollateralSectionProps {
  amount?: string;
  usdValue?: string;
  hasCollateral?: boolean;
  isConnected?: boolean;
  isPendingDeposit?: boolean;
  onAdd: () => void;
  onWithdraw: () => void;
}

export function CollateralSection({
  amount,
  usdValue,
  hasCollateral = false,
  isConnected = false,
  isPendingDeposit = false,
  onAdd,
  onWithdraw,
}: CollateralSectionProps) {
  const showWithdrawButton = hasCollateral && !isPendingDeposit;

  const renderContent = () => {
    if (isPendingDeposit) return <PendingContent />;
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
            disabled={!isConnected}
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
