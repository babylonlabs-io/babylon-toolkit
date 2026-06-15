import { Avatar } from "@babylonlabs-io/core-ui";

import { getCurrencyIconWithFallback } from "@/services/token/tokenService";
import { formatPriceUsd } from "@/utils/formatting";

interface AssetListItemProps {
  symbol: string;
  name: string;
  /** Icon URL (optional - will use fallback if not provided) */
  icon?: string;
  priceUsd?: number;
  /** Whether this item is the currently-selected asset */
  selected?: boolean;
  onClick: () => void;
}

export function AssetListItem({
  symbol,
  name,
  icon,
  priceUsd,
  selected = false,
  onClick,
}: AssetListItemProps) {
  return (
    <button
      onClick={onClick}
      aria-current={selected || undefined}
      className={`flex w-full cursor-pointer items-center gap-4 rounded-lg p-4 transition-colors ${
        selected
          ? "bg-secondary-strokeLight dark:bg-secondary-strokeDark"
          : "bg-secondary-highlight hover:bg-secondary-strokeLight dark:bg-primary-main dark:hover:bg-secondary-strokeDark"
      }`}
    >
      <Avatar
        url={getCurrencyIconWithFallback(icon, symbol)}
        alt={name}
        size="medium"
        variant="circular"
        className="h-10 w-10 rounded-full bg-white"
      />
      <div className="flex flex-1 flex-col items-start">
        <span className="text-base font-medium text-accent-primary">
          {name}
        </span>
        <span className="text-sm text-accent-secondary">{symbol}</span>
      </div>
      {priceUsd !== undefined && (
        <span className="text-base font-medium text-accent-primary">
          {formatPriceUsd(priceUsd)}
        </span>
      )}
    </button>
  );
}
