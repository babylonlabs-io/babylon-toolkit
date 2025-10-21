import { Button, DialogBody, DialogFooter, DialogHeader, Text } from "@babylonlabs-io/core-ui";
import { memo, useMemo, useCallback } from "react";
import { twMerge } from "tailwind-merge";

import { WalletButton } from "@/components/WalletButton";
import type { IChain, IWallet } from "@/core/types";

export interface WalletsProps {
  chain: IChain;
  className?: string;
  append?: JSX.Element;
  onClose?: () => void;
  onSelectWallet?: (chain: IChain, wallet: IWallet) => void;
  onBack?: () => void;
}

export const Wallets = memo(({ chain, className, append, onClose, onBack, onSelectWallet }: WalletsProps) => {
  const wallets = useMemo(
    () => chain.wallets.filter((wallet) => (wallet.id === "injectable" ? wallet.installed : true)),
    [chain],
  );

  const handleWalletClick = useCallback(
    async (wallet: IWallet) => {
      if (wallet?.id === "appkit-eth-connector") {
        try {
          window.dispatchEvent(new CustomEvent("babylon:open-appkit"));
        } catch {
          onSelectWallet?.(chain, wallet);
        }
        return;
      }

      onSelectWallet?.(chain, wallet);
    },
    [chain, onSelectWallet],
  );

  return (
    <div className={twMerge("flex flex-1 flex-col", className)}>
      <DialogHeader className="mb-10 text-accent-primary" title="Select Wallet" onClose={onClose}>
        <Text className="text-accent-secondary">Connect a {chain.name} Wallet</Text>
      </DialogHeader>

      <DialogBody>
        <div className={twMerge("grid gap-6", wallets.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
          {wallets.map((wallet) => (
            <WalletButton
              installed={wallet.installed}
              key={wallet.id}
              name={wallet.name}
              logo={wallet.icon}
              label={wallet.label}
              fallbackLink={wallet.docs}
              onClick={() => handleWalletClick(wallet)}
            />
          ))}
        </div>

        {append}
      </DialogBody>

      <DialogFooter className="mt-auto pt-10">
        <Button variant="outlined" fluid onClick={onBack}>
          Back
        </Button>
      </DialogFooter>
    </div>
  );
});
