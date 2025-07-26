import { Avatar, Text } from "@babylonlabs-io/core-ui";
import { memo } from "react";
import { twMerge } from "tailwind-merge";

import { formatAddress } from "@/utils/wallet";

interface ConnectedWalletProps {
  className?: string;
  chainId: string;
  logo: string;
  name: string;
  address: string;
  onDisconnect?: (chainId: string) => void;
}

export const ConnectedWallet = memo(
  ({ className, chainId, logo, name, address, onDisconnect }: ConnectedWalletProps) => (
    <div
      className={twMerge("flex shrink-0 items-center gap-2.5 rounded border border-secondary-main/30 p-2", className)}
    >
      <Avatar variant="rounded" size="medium" url={logo} />

      <div className="flex flex-1 flex-col items-start">
        <Text as="div" variant="body2" className="leading-4 text-accent-primary">
          {name}
        </Text>
        {Boolean(address) && (
          <Text as="div" variant="caption" className="leading-4 text-accent-secondary">
            {formatAddress(address)}
          </Text>
        )}
      </div>

      <button className="shrink-0 cursor-pointer" onClick={() => void onDisconnect?.(chainId)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          className="text-secondary-main"
          fill="none"
        >
          <path
            d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  ),
);
