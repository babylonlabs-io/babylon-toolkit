import { Avatar, Text } from "@babylonlabs-io/core-ui";
import { memo } from "react";
import { twMerge } from "tailwind-merge";

interface ConnectedWalletProps {
  className?: string;
  logo: string;
  address: string;
}

export const ConnectedWallet = memo(({ className, logo, address }: ConnectedWalletProps) => (
  <div className={twMerge("flex items-center gap-2.5 rounded-lg bg-secondary-highlight p-2", className)}>
    <Avatar variant="rounded" size="small" className="shrink-0" url={logo} />

    <Text as="div" variant="caption" title={address} className="truncate font-mono text-accent-secondary">
      {address}
    </Text>
  </div>
));
