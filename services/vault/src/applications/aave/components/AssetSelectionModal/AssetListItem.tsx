import { Avatar } from "@babylonlabs-io/core-ui";

import { getCurrencyIconWithFallback } from "@/services/token/tokenService";

interface AssetListItemProps {
  symbol: string;
  name: string;
  /** Icon URL (optional - will use fallback if not provided) */
  icon?: string;
  priceUsd?: number;
  onClick: () => void;
}

function formatPrice(priceUsd: number): string {
  if (priceUsd >= 1000) {
    return `$${priceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `$${priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AssetListItem({
  symbol,
  name,
  icon,
  priceUsd,
  onClick,
}: AssetListItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-4 rounded-lg bg-secondary-highlight p-4 transition-colors hover:bg-secondary-strokeLight dark:bg-primary-main dark:hover:bg-secondary-strokeDark"
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
          {formatPrice(priceUsd)}
        </span>
      )}
    </button>
  );
}
