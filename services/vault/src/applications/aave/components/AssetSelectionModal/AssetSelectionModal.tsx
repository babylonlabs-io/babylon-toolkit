/**
 * AssetSelectionModal Component
 * Modal for selecting an asset to borrow from available reserves
 */

import {
  DialogBody,
  DialogHeader,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";

import { useAaveConfig } from "../../context";

import { AssetListItem } from "./AssetListItem";

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (assetSymbol: string) => void;
}

export function AssetSelectionModal({
  isOpen,
  onClose,
  onSelectAsset,
}: AssetSelectionModalProps) {
  const { borrowableReserves, isLoading } = useAaveConfig();

  const handleAssetClick = (assetSymbol: string) => {
    onSelectAsset(assetSymbol);
    onClose();
  };

  const renderContent = () => {
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

    return borrowableReserves.map((reserve) => (
      <AssetListItem
        key={reserve.reserveId.toString()}
        symbol={reserve.token.symbol}
        name={reserve.token.name}
        onClick={() => handleAssetClick(reserve.token.symbol)}
      />
    ));
  };

  return (
    <ResponsiveDialog open={isOpen} onClose={onClose}>
      <DialogHeader
        title="Borrow"
        onClose={onClose}
        className="text-accent-primary"
      />
      <DialogBody className="space-y-4">
        <p className="text-base text-accent-secondary">
          Choose the asset to borrow
        </p>
        <div className="space-y-2">{renderContent()}</div>
      </DialogBody>
    </ResponsiveDialog>
  );
}
