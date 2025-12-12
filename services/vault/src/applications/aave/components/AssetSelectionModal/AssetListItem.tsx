import { Avatar } from "@babylonlabs-io/core-ui";

import { DEFAULT_TOKEN_ICON, TOKEN_ICONS } from "../../constants";

interface AssetListItemProps {
  symbol: string;
  name: string;
  onClick: () => void;
}

export function AssetListItem({ symbol, name, onClick }: AssetListItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-4 rounded-lg bg-secondary-highlight p-4 transition-colors hover:bg-secondary-strokeLight dark:bg-primary-main dark:hover:bg-secondary-strokeDark"
    >
      <Avatar
        url={TOKEN_ICONS[symbol] ?? DEFAULT_TOKEN_ICON}
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
