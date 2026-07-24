/**
 * VaultsPage — the v3 /vaults route (issue #2041).
 *
 * Owns the page container, the empty state, the load-error state, and the
 * populated layout: the summary card, the pending-deposits list, and the
 * active-vaults list, with the withdraw and reorder flows mounted at page
 * level. Withdrawal sections join the page with the relocation step of the
 * same issue.
 */

import { Container, Loader, Notification } from "@babylonlabs-io/core-ui";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import type { Address } from "viem";

import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import {
  isDepositBlocked,
  isReorderBlocked,
  isWithdrawBlocked,
} from "@/components/shared/protocolStatus";
import {
  ReorderSuccessModal,
  ReorderVaultsModal,
} from "@/components/simple/ReorderVaults";
import WithdrawFlow from "@/components/simple/WithdrawFlow";
import { VaultsActiveSection } from "@/components/vaults/VaultsActiveSection";
import { VaultsEmptyState } from "@/components/vaults/VaultsEmptyState";
import { VaultsLifecycleSections } from "@/components/vaults/VaultsLifecycleSections";
import { VaultsSummaryCard } from "@/components/vaults/VaultsSummaryCard";
import { FeatureFlags } from "@/config";
import { useConnection, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useDemoDeposit } from "@/dev/demoDeposit";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { useVaultsPageData } from "@/hooks/useVaultsPageData";
import { useVaultsPageEmptiness } from "@/hooks/useVaultsPageEmptiness";
import { invalidateVaultQueries, vaultOrderQueryKey } from "@/utils/queryKeys";

// Dev-only god-mode panel, lazily imported behind `import.meta.env.DEV` so its
// code is dropped from production builds entirely (same pattern as
// DashboardPage).
const GodModePanel = import.meta.env.DEV
  ? lazy(() =>
      import("@/dev/GodModePanel").then((m) => ({ default: m.GodModePanel })),
    )
  : null;

export default function VaultsPage() {
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { isConnected } = useConnection();
  const { address } = useETHWallet();
  const gate = useProtocolGateState();
  const queryClient = useQueryClient();
  // The page's single usePendingDeposits instance — shared by the emptiness
  // hook and the lifecycle sections so the broadcast/refund modal state pair
  // is instantiated once.
  const deposits = usePendingDeposits();
  const { isLoading, isEmpty, hasError, hasPartialError } =
    useVaultsPageEmptiness(deposits);
  const {
    summary,
    displayVaults,
    rawCollateralVaults,
    collateralBtc,
    collateralValueUsd,
  } = useVaultsPageData(isConnected ? address : undefined);

  // God-mode demo aggregate (dev only; null unless the panel's "Inject demo"
  // toggle is on). Routes the page to the populated layout even while
  // disconnected, so the sections can be exercised without a wallet.
  const demo = useDemoDeposit();

  // Withdraw flow, opened per-row with that vault preselected. Only the
  // demo-free list ever reaches it; its optimistic activating entries are
  // unselectable (each such row's Withdraw stays disabled until indexed).
  const [withdrawVaultIds, setWithdrawVaultIds] = useState<string[] | null>(
    null,
  );
  const [isReorderOpen, setIsReorderOpen] = useState(false);
  const [isReorderSuccess, setIsReorderSuccess] = useState(false);

  const isDepositsPaused = FeatureFlags.isDepositDisabled;

  // `sectionPlacement` = rendered inline in the Vaults section beneath a pending
  // deposit, where it sits on the same bordered surface as the sibling cards.
  // The whole-page state (false) sits on the standalone v3 empty-state card.
  const renderEmptyState = (sectionPlacement: boolean) => (
    <VaultsEmptyState
      isConnected={isConnected}
      isDepositsPaused={isDepositsPaused}
      isDepositDisabled={isDepositBlocked(gate)}
      onDeposit={() => openDeposit()}
      sectionPlacement={sectionPlacement}
    />
  );

  const reorderableVaults = useMemo(
    () => rawCollateralVaults.filter((vault) => !vault.isActivating),
    [rawCollateralVaults],
  );
  const canReorder = reorderableVaults.length >= 2;

  const handleWithdrawRow = useCallback((vaultId: string) => {
    setWithdrawVaultIds([vaultId]);
  }, []);
  const handleWithdrawClose = useCallback(() => setWithdrawVaultIds(null), []);

  // Mirrors CollateralSection: dismissing the success modal hands display
  // back to the indexer by refetching the order-dependent queries.
  const handleReorderSuccessClose = useCallback(() => {
    setIsReorderSuccess(false);
    if (address) {
      queryClient.invalidateQueries({
        queryKey: vaultOrderQueryKey(address),
      });
      invalidateVaultQueries(queryClient, address as Address);
    }
  }, [address, queryClient]);

  const isDevToolingEnabled =
    import.meta.env.DEV && FeatureFlags.isGodModePanelEnabled;

  const populatedBody = (
    <div className="flex flex-col gap-8">
      {/* One of the two data sources failed while the other still has rows —
          the page prefers showing what it has, but the gap must never be
          silent: a failed position read would otherwise present zero totals
          as real, and a failed deposits read would drop pending rows. */}
      {hasPartialError && (
        <Notification
          variant="warning"
          title={COPY.vaults.partialLoadError.title}
          data-testid="vaults-partial-load-error"
        >
          {COPY.vaults.partialLoadError.body}
        </Notification>
      )}
      <VaultsSummaryCard
        totalCollateralBtc={summary.totalCollateralBtc}
        totalCollateralUsd={summary.totalCollateralUsd}
        activeVaultsCount={summary.activeVaultsCount}
        liquidationOrder={summary.liquidationOrder}
        healthFactor={summary.healthFactor}
        healthFactorStatus={summary.healthFactorStatus}
        onDeposit={() => openDeposit()}
        isDepositDisabled={isDepositBlocked(gate)}
        onReorder={() => setIsReorderOpen(true)}
        isReorderDisabled={!canReorder || isReorderBlocked(gate)}
      />
      {/* Section order is Pending → Active → Inactive: the lifecycle
          component renders its children between its two lists. */}
      <VaultsLifecycleSections deposits={deposits}>
        <VaultsActiveSection
          vaults={displayVaults}
          onWithdraw={handleWithdrawRow}
          isWithdrawDisabled={isWithdrawBlocked(gate)}
          // Pending deposits keep the page populated while the vault list is
          // still empty — the section shows the empty state until the deposit
          // confirms and activates. Section placement sits on the sibling-card
          // surface, not the standalone empty-state card.
          emptyState={renderEmptyState(true)}
        />
      </VaultsLifecycleSections>
    </div>
  );

  const renderBody = () => {
    // Dev-only: with demo injection on, always show the populated layout —
    // even while disconnected — so the page can be exercised without a wallet.
    if (isDevToolingEnabled && demo) return populatedBody;
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader />
        </div>
      );
    }
    if (hasError) {
      return (
        <div className="flex items-center justify-center py-12">
          <p className="text-base text-accent-secondary">
            {COPY.vaults.loadError}
          </p>
        </div>
      );
    }
    if (!isEmpty) return populatedBody;
    return renderEmptyState(false);
  };

  // Dev/QA god-mode panel (same gate and pattern as DashboardPage) so demo
  // items can be injected from this page without navigating to Overview.
  const godModePanel =
    isDevToolingEnabled && GodModePanel ? (
      <Suspense fallback={null}>
        <GodModePanel />
      </Suspense>
    ) : null;

  return (
    <Container as="main" className={`${PAGE_CONTENT_CLASS} pb-6`}>
      {renderBody()}
      {godModePanel}

      <WithdrawFlow
        open={withdrawVaultIds !== null}
        onClose={handleWithdrawClose}
        collateralVaults={rawCollateralVaults}
        collateralBtc={collateralBtc}
        collateralValueUsd={collateralValueUsd}
        currentHealthFactor={summary.healthFactor}
        preSelectedVaultIds={withdrawVaultIds ?? []}
      />

      <ReorderVaultsModal
        isOpen={isReorderOpen}
        onClose={() => setIsReorderOpen(false)}
        vaults={reorderableVaults}
        onSuccess={() => setIsReorderSuccess(true)}
      />

      <ReorderSuccessModal
        isOpen={isReorderSuccess}
        onClose={handleReorderSuccessClose}
      />
    </Container>
  );
}
