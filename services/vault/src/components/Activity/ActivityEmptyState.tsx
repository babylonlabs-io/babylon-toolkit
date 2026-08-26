import { useOutletContext } from "react-router";

import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { EmptyState } from "@/components/shared/EmptyState";
import { COPY } from "@/copy";

interface ActivityEmptyStateProps {
  isConnected: boolean;
  isFiltered?: boolean;
}

export function ActivityEmptyState({
  isConnected,
  isFiltered,
}: ActivityEmptyStateProps) {
  const { openDeposit } = useOutletContext<RootLayoutContext>();

  // The shared EmptyState card (document-search icon + Deposit CTA) matches the
  // Figma "before deposit" frame. Disconnected shows the Connect control;
  // filtered-empty stays a distinct message with no CTA.
  if (isFiltered) {
    return (
      <div data-testid="activity-empty-state">
        <EmptyState title={COPY.activity.emptyFiltered} isConnected withCard />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div data-testid="activity-empty-state">
        <EmptyState
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
