/**
 * AssetSelectionModal Component
 * Modal for selecting an asset to borrow or repay from available reserves
 */

import {
  DialogBody,
  DialogHeader,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";

import { getTokenByAddress } from "@/services/token/tokenService";

import { LOAN_TAB, type LoanTab } from "../../constants";
import { useAaveConfig } from "../../context";
import type { Asset } from "../../types";

import { AssetListItem } from "./AssetListItem";

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (assetSymbol: string) => void;
  /** Mode determines the modal title and description */
  mode?: LoanTab;
  /**
   * Optional list of assets to display.
   * When provided, these assets are shown instead of the default borrowable reserves.
   */
  assets?: Asset[];
}

const MODE_CONFIG: Record<LoanTab, { title: string; description: string }> = {
  [LOAN_TAB.BORROW]: {
    title: "Borrow",
    description: "Choose the asset to borrow",
  },
  [LOAN_TAB.REPAY]: {
    title: "Repay",
    description: "Choose the asset to repay",
  },
};

export function AssetSelectionModal({
  isOpen,
  onClose,
  onSelectAsset,
  mode = LOAN_TAB.BORROW,
  assets,
}: AssetSelectionModalProps) {
  const { borrowableReserves, isLoading } = useAaveConfig();
  const config = MODE_CONFIG[mode];

  const handleAssetClick = (assetSymbol: string) => {
    onSelectAsset(assetSymbol);
    onClose();
  };

  const renderContent = () => {
    if (assets) {
      if (assets.length === 0) {
        return (
          <p className="text-center text-accent-secondary">
            No assets available
          </p>
        );
      }

      return assets.map((asset) => (
        <AssetListItem
          key={asset.symbol}
          symbol={asset.symbol}
          name={asset.name}
          icon={asset.icon}
          onClick={() => handleAssetClick(asset.symbol)}
        />
      ));
    }

    // Default: use borrowable reserves from config
    if (isLoading) {
      return (
        <p className="text-center text-accent-secondary">Loading assets...</p>
      );
    }

    if (borrowableReserves.length === 0) {
      return (
        <p className="text-center text-accent-secondary">
          No borrowable assets available
        </p>
      );
    }

    return borrowableReserves.map((reserve) => {
      // Get icon from token service registry
      const tokenMetadata = getTokenByAddress(reserve.token.address);
      return (
        <AssetListItem
          key={reserve.reserveId.toString()}
          symbol={reserve.token.symbol}
          name={reserve.token.name}
          icon={tokenMetadata?.icon}
          onClick={() => handleAssetClick(reserve.token.symbol)}
        />
      );
    });
  };

  return (
    <ResponsiveDialog open={isOpen} onClose={onClose}>
      <DialogHeader
        title={config.title}
        onClose={onClose}
        className="text-accent-primary"
      />
      <DialogBody className="space-y-4">
        <p className="text-base text-accent-secondary">{config.description}</p>
        <div className="space-y-2">{renderContent()}</div>
      </DialogBody>
    </ResponsiveDialog>
  );
}
