import { Avatar } from "@babylonlabs-io/core-ui";

import {
  type BorrowAssetSelectionState,
  useBorrowAssetSelection,
} from "./useBorrowAssetSelection";

interface BorrowAssetSelectionProps {
  onSelectAsset: (symbol: string) => void;
}

export function BorrowAssetSelection({
  onSelectAsset,
}: BorrowAssetSelectionProps) {
  const state = useBorrowAssetSelection();

  return (
    <BorrowAssetSelectionView state={state} onSelectAsset={onSelectAsset} />
  );
}

interface BorrowAssetSelectionViewProps {
  state: BorrowAssetSelectionState;
  onSelectAsset: (symbol: string) => void;
}

function BorrowAssetSelectionView({
  state,
  onSelectAsset,
}: BorrowAssetSelectionViewProps) {
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <h2 className="mb-6 text-[28px] font-normal text-accent-primary">
        Select Asset
      </h2>

      {/* Column headers */}
      <div className="mb-2 grid grid-cols-3 px-4 text-sm text-accent-secondary">
        <span>Asset</span>
        <span className="text-right">Price</span>
        <span className="text-right">Rate</span>
      </div>

      {/* Asset list */}
      <div className="flex flex-col gap-2">
        {state.isLoading && (
          <p className="py-8 text-center text-accent-secondary">
            Loading assets...
          </p>
        )}

        {!state.isLoading && state.assets.length === 0 && (
          <p className="py-8 text-center text-accent-secondary">
            No borrowable assets available
          </p>
        )}

        {!state.isLoading &&
          state.assets.map((asset) => (
            <button
              key={asset.reserveId}
              onClick={() => onSelectAsset(asset.symbol)}
              className="bg-primary-surface hover:bg-primary-surface/80 grid grid-cols-3 items-center rounded-lg p-4 transition-colors dark:bg-[#202020] dark:hover:bg-[#2a2a2a]"
            >
              {/* Asset */}
              <div className="flex items-center gap-3">
                <Avatar url={asset.icon} alt={asset.symbol} size="small" />
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium text-accent-primary">
                    {asset.name}
                  </span>
                  <span className="text-xs text-accent-secondary">
                    {asset.symbol}
                  </span>
                </div>
              </div>

              {/* Price */}
              <span className="text-right text-sm text-accent-primary">
                {asset.priceFormatted}
              </span>

              {/* Rate */}
              <span className="text-right text-sm text-accent-secondary">
                {asset.rateFormatted}
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}
