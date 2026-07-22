/**
 * useLoanActions hook
 * Owns the borrow/repay entry-point orchestration shared by the v2 dashboard
 * and the v3 Loans page: the asset-selection modal state, opening borrow/repay
 * pickers (with the single-borrowed-asset direct-navigation shortcut), and
 * direct navigation to a reserve's detail overlay. The overlay itself is
 * route-driven (`?reserve=<symbol>&tab=<borrow|repay>`), rendered by
 * `AaveOverlayLayout`.
 */

import { type ComponentProps, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { AssetSelectionModal } from "@/applications/aave/components/AssetSelectionModal";
import { LOAN_TAB, type LoanTab } from "@/applications/aave/constants";
import type { Asset } from "@/applications/aave/types";
import featureFlags from "@/config/featureFlags";
import { getReserveDetailRoute } from "@/routes";

interface UseLoanActionsProps {
  /** Borrowed assets (used to resolve the single-asset repay shortcut). */
  borrowedAssets: { symbol: string }[];
  /** Borrowed assets shaped for the repay-mode asset picker. */
  selectableBorrowedAssets: Asset[];
}

// Typed against the modal's real props so the two can't drift; spread onto
// `<AssetSelectionModal {...assetModalProps} />` by the consuming pages.
type AssetSelectionModalProps = ComponentProps<typeof AssetSelectionModal>;

export function useLoanActions({
  borrowedAssets,
  selectableBorrowedAssets,
}: UseLoanActionsProps) {
  const navigate = useNavigate();
  const isV3 = featureFlags.isV3UiEnabled;

  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetModalMode, setAssetModalMode] = useState<LoanTab>(
    LOAN_TAB.BORROW,
  );

  const goToReserve = useCallback(
    (assetSymbol: string, tab: LoanTab) => {
      navigate(getReserveDetailRoute(assetSymbol, tab, isV3));
    },
    [navigate, isV3],
  );

  const openBorrowPicker = useCallback(() => {
    setAssetModalMode(LOAN_TAB.BORROW);
    setIsAssetModalOpen(true);
  }, []);

  const openRepay = useCallback(() => {
    // A single borrowed asset has no choice to make — skip the picker and open
    // its repay overlay directly.
    if (borrowedAssets.length === 1) {
      goToReserve(borrowedAssets[0].symbol, LOAN_TAB.REPAY);
      return;
    }
    setAssetModalMode(LOAN_TAB.REPAY);
    setIsAssetModalOpen(true);
  }, [borrowedAssets, goToReserve]);

  const handleSelectAsset = useCallback(
    (assetSymbol: string) => {
      goToReserve(assetSymbol, assetModalMode);
    },
    [goToReserve, assetModalMode],
  );

  const assetModalProps: AssetSelectionModalProps = useMemo(
    () => ({
      isOpen: isAssetModalOpen,
      onClose: () => setIsAssetModalOpen(false),
      onSelectAsset: handleSelectAsset,
      mode: assetModalMode,
      assets:
        assetModalMode === LOAN_TAB.REPAY
          ? selectableBorrowedAssets
          : undefined,
    }),
    [
      isAssetModalOpen,
      handleSelectAsset,
      assetModalMode,
      selectableBorrowedAssets,
    ],
  );

  return { openBorrowPicker, openRepay, goToReserve, assetModalProps };
}
