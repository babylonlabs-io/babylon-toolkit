/**
 * VaultsEmptyState Component
 * Displays empty state when user has no BTC vaults
 */

import { Avatar, Button, SubSection } from "@babylonlabs-io/core-ui";

import { Connect } from "@/components/Wallet";

interface VaultsEmptyStateProps {
  isConnected: boolean;
  onDeposit: () => void;
}

export function VaultsEmptyState({
  isConnected,
  onDeposit,
}: VaultsEmptyStateProps) {
  return (
    <SubSection className="w-full py-28">
      <div className="flex flex-col items-center justify-center gap-2">
        {/* Bitcoin Logo */}
        <Avatar
          url="/images/btc@2x.png"
          alt="Bitcoin"
          size="xlarge"
          className="mb-2 h-[100px] w-[100px]"
        />

        {/* Primary Text */}
        <p className="text-[20px] text-accent-primary">
          You have no BTC Vaults available.
        </p>

        {/* Secondary Text */}
        <p className="text-[14px] text-accent-secondary">
          Deposit BTC to create your first vault and enable borrowing.
        </p>

        {/* Deposit/Connect Button */}
        <div className="mt-8">
          {isConnected ? (
            <Button
              variant="contained"
              color="primary"
              size="medium"
              onClick={onDeposit}
              className="rounded-full !bg-white !text-black hover:!bg-gray-100"
            >
              Deposit BTC
            </Button>
          ) : (
            <Connect />
          )}
        </div>
      </div>
    </SubSection>
  );
}
