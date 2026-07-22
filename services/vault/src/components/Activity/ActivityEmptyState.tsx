import { Button } from "@babylonlabs-io/core-ui";
import { useOutletContext } from "react-router";

import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { EmptyState } from "@/components/shared/EmptyState";
import { EmptyStateIcon } from "@/components/shared/icons";
import { FeatureFlags, getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";

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

  // v3: the shared EmptyState card (document-search icon + Deposit CTA) matches
  // the Figma "before deposit" frame. Disconnected shows the Connect control;
  // filtered-empty stays a distinct message with no CTA. The testid is carried
  // over so the same hook covers both UIs.
  if (FeatureFlags.isV3UiEnabled) {
    if (isFiltered) {
      return (
        <div data-testid="activity-empty-state">
          <EmptyState
            icon={<EmptyStateIcon />}
            title={COPY.activity.emptyFiltered}
            isConnected
            withCard
          />
        </div>
      );
    }

    if (!isConnected) {
      return (
        <div data-testid="activity-empty-state">
          <EmptyState
            icon={<EmptyStateIcon />}
            title={COPY.activity.emptyDisconnected}
            isConnected={false}
            withCard
          />
        </div>
      );
    }

    return (
      <div data-testid="activity-empty-state">
        <EmptyState
          icon={<EmptyStateIcon />}
          title={COPY.activity.emptyV3Title}
          description={COPY.activity.emptyV3Body}
          isConnected
          actionLabel={COPY.overview.depositAction}
          onAction={() => openDeposit()}
          withCard
        />
      </div>
    );
  }

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
