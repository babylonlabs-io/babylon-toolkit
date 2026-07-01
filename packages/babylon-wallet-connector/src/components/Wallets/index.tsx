import { Heading, Text } from "@babylonlabs-io/core-ui";
import { memo, useCallback, useMemo } from "react";
import { twMerge } from "tailwind-merge";

import { WalletButton } from "@/components/WalletButton";
import { type BTCConfig, type IChain, type IWallet, Network } from "@/core/types";

const TAPROOT_ADDRESS_PREFIX: Record<Network, string> = {
  [Network.MAINNET]: "bc1p",
  [Network.TESTNET]: "tb1p",
  [Network.SIGNET]: "tb1p",
};

export interface WalletsProps {
  chain: IChain;
  className?: string;
  append?: JSX.Element;
  onSelectWallet?: (chain: IChain, wallet: IWallet) => void;
}

// Connect-list ordering: installed software wallets (green) first, then
// hardware wallets (yellow — available but need connecting), then uninstalled
// download-only options (gray) at the bottom. A lower rank sorts higher, so
// when no software wallet is installed the hardware options surface to the top.
const walletDisplayRank = (wallet: IWallet): number => {
  if (wallet.installed && !wallet.hardware) return 0;
  if (wallet.hardware) return 1;
  return 2;
};

export const Wallets = memo(({ chain, className, append, onSelectWallet }: WalletsProps) => {
  const wallets = useMemo(
    () =>
      chain.wallets
        .filter((wallet) => (wallet.id === "injectable" ? wallet.installed : true))
        .sort((a, b) => walletDisplayRank(a) - walletDisplayRank(b)),
    [chain],
  );

  // Taproot is a hard requirement for the BTC vault, so surface the expected
  // address prefix for the connected network (bc1p on mainnet, tb1p otherwise).
  const subtitle = useMemo(() => {
    if (chain.id !== "BTC") return null;

    const network = (chain.config as BTCConfig | undefined)?.network;
    const prefix = network ? TAPROOT_ADDRESS_PREFIX[network] : undefined;
    if (!prefix) return null;

    return `To continue, connect a ${chain.name} wallet with a ${prefix} (Taproot) address.`;
  }, [chain]);

  const handleWalletClick = useCallback(
    async (wallet: IWallet) => {
      onSelectWallet?.(chain, wallet);
    },
    [chain, onSelectWallet],
  );

  return (
    <div className={twMerge("flex flex-col overflow-hidden rounded-2xl border border-secondary-strokeLight", className)}>
      <div className="flex flex-col gap-2 border-b border-secondary-strokeLight p-6">
        <Heading variant="h5" className="text-accent-primary">
          {`Select ${chain.name} Wallet`}
        </Heading>
        {subtitle && (
          <Text variant="body2" className="text-accent-secondary">
            {subtitle}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-4 p-6">
        {wallets.map((wallet) => (
          <WalletButton
            installed={wallet.installed}
            hardware={wallet.hardware}
            label={wallet.label}
            key={wallet.id}
            name={wallet.name}
            logo={wallet.icon}
            logoBackground={wallet.iconBackground}
            fallbackLink={wallet.docs}
            onClick={() => handleWalletClick(wallet)}
          />
        ))}

        {append}
      </div>
    </div>
  );
});
