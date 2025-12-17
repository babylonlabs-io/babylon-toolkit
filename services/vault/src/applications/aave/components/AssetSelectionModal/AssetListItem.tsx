import { Avatar } from "@babylonlabs-io/core-ui";

import { getCurrencyIconWithFallback } from "@/services/token/tokenService";

interface AssetListItemProps {
  symbol: string;
  name: string;
  /** Icon URL (optional - will use fallback if not provided) */
  icon?: string;
  onClick: () => void;
}

export function AssetListItem({
  symbol,
  name,
  icon,
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
      <div className="flex flex-col items-start">
        <span className="text-base font-medium text-accent-primary">
          {name}
        </span>
        <span className="text-sm text-accent-secondary">{symbol}</span>
      </div>
    </button>
  );
}
