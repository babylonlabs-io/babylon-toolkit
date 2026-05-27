import { Button } from "@babylonlabs-io/core-ui";
import { useOutletContext } from "react-router";

import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { COPY } from "@/copy";

import { getNetworkConfigBTC } from "../../config";

const btcConfig = getNetworkConfigBTC();

interface ActivityEmptyStateProps {
  isConnected: boolean;
  isFiltered?: boolean;
}

export function ActivityEmptyState({
  isConnected,
  isFiltered,
}: ActivityEmptyStateProps) {
  const { openDeposit } = useOutletContext<RootLayoutContext>();

  if (isFiltered) {
    return (
      <div
        data-testid="activity-empty-state"
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <p className="text-lg text-accent-secondary">
          {COPY.activity.emptyFiltered}
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div
        data-testid="activity-empty-state"
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <p className="text-lg text-accent-secondary">
          {COPY.activity.emptyDisconnected}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="activity-empty-state"
      className="flex flex-col items-center justify-center gap-4 py-12 text-center"
    >
      <p className="text-lg text-accent-secondary">
        {COPY.activity.emptyConnected}
      </p>
      <Button color="secondary" onClick={() => openDeposit()}>
        {COPY.activity.depositCta(btcConfig.coinSymbol)}
      </Button>
    </div>
  );
}
