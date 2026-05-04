/**
 * ActivityEmptyState Component
 * Shown when there are no activities to display
 */

import { Button } from "@babylonlabs-io/core-ui";
import { useOutletContext } from "react-router";

import type { RootLayoutContext } from "@/components/pages/RootLayout";

import { getNetworkConfigBTC } from "../../config";

const btcConfig = getNetworkConfigBTC();

interface ActivityEmptyStateProps {
  isConnected: boolean;
}

export function ActivityEmptyState({ isConnected }: ActivityEmptyStateProps) {
  const { openDeposit } = useOutletContext<RootLayoutContext>();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg text-accent-secondary">
          Connect your wallet to view your activity
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <p className="text-lg text-accent-secondary">
        No activity yet. Make your first deposit to get started.
      </p>
      <Button color="secondary" rounded onClick={() => openDeposit()}>
        Deposit {btcConfig.coinSymbol}
      </Button>
    </div>
  );
}
