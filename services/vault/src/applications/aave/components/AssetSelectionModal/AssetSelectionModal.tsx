/**
 * AssetSelectionModal Component
 * Modal for selecting an asset to borrow (USDC, USDT, WBTC)
 */

import {
  Avatar,
  DialogBody,
  DialogHeader,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";

interface Asset {
  id: string;
  name: string;
  symbol: string;
  icon: string;
}

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (assetSymbol: string) => void;
}

// TODO: Replace with actual assets from a registry
const ASSETS: Asset[] = [
  {
    id: "usdc",
    name: "USD Coin",
    symbol: "USDC",
    icon: "/images/usdc.png",
  },
  {
    id: "usdt",
    name: "Tether",
    symbol: "USDT",
    icon: "/images/usdt.png",
  },
  {
    id: "wbtc",
    name: "Wrapped BTC",
    symbol: "WBTC",
    icon: "/images/wbtc.png",
  },
];

export function AssetSelectionModal({
  isOpen,
  onClose,
  onSelectAsset,
}: AssetSelectionModalProps) {
  const handleAssetClick = (assetSymbol: string) => {
    onSelectAsset(assetSymbol);
    onClose();
  };

  return (
    <ResponsiveDialog open={isOpen} onClose={onClose}>
      <DialogHeader
        title="Borrow"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="space-y-4">
        {/* Subtitle */}
        <p className="text-base text-accent-secondary">
          Choose the asset to borrow
        </p>

        {/* Asset List */}
        <div className="space-y-2">
          {ASSETS.map((asset) => (
            <button
              key={asset.id}
              onClick={() => handleAssetClick(asset.symbol)}
              className="w-full flex items-center gap-4 p-4 rounded-lg bg-secondary-highlight dark:bg-primary-main hover:bg-secondary-strokeLight dark:hover:bg-secondary-strokeDark transition-colors cursor-pointer"
            >
              <Avatar
                url={asset.icon}
                alt={asset.name}
                size="medium"
                variant="circular"
                className="w-10 h-10 rounded-full bg-white"
              />
              <div className="flex flex-col items-start">
                <span className="text-base font-medium text-accent-primary">
                  {asset.name}
                </span>
                <span className="text-sm text-accent-secondary">
                  {asset.symbol}
                </span>
              </div>
            </button>
          ))}
        </div>
      </DialogBody>
    </ResponsiveDialog>
  );
}

