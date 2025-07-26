import { Button, DialogBody, DialogFooter, DialogHeader, Text } from "@babylonlabs-io/core-ui";
import { memo } from "react";
import { twMerge } from "tailwind-merge";

import { ChainButton } from "@/components/ChainButton";
import { ConnectedWallet } from "@/components/ConnectedWallet";
import type { IChain, IWallet } from "@/core/types";

interface ChainsProps {
  disabled?: boolean;
  chains: IChain[];
  className?: string;
  selectedWallets?: Record<string, IWallet | undefined>;
  onClose?: () => void;
  onConfirm?: () => void;
  onDisconnectWallet?: (chainId: string) => void;
  onSelectChain?: (chain: IChain) => void;
}

export const Chains = memo(
  ({
    disabled = false,
    chains,
    selectedWallets = {},
    className,
    onClose,
    onConfirm,
    onSelectChain,
    onDisconnectWallet,
  }: ChainsProps) => (
    <div className={twMerge("flex flex-1 flex-col text-accent-primary", className)}>
      <DialogHeader className="mb-10" title="Connect Wallets" onClose={onClose}>
        <Text className="text-accent-secondary">Connect to both Bitcoin and Babylon Chain Wallets</Text>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-6">
        {chains.map((chain) => {
          const selectedWallet = selectedWallets[chain.id];

          return (
            <ChainButton
              key={chain.id}
              disabled={Boolean(selectedWallet)}
              title={`Select ${chain.name} Wallet`}
              logo={chain.icon}
              alt={chain.name}
              onClick={() => void onSelectChain?.(chain)}
            >
              {selectedWallet && (
                <ConnectedWallet
                  chainId={chain.id}
                  logo={selectedWallet.icon}
                  name={selectedWallet.name}
                  address={selectedWallet.account?.address ?? ""}
                  onDisconnect={onDisconnectWallet}
                />
              )}
            </ChainButton>
          );
        })}
      </DialogBody>

      <DialogFooter className="mt-auto flex gap-4 pt-10">
        <Button variant="outlined" fluid onClick={onClose}>
          Cancel
        </Button>

        <Button disabled={disabled} fluid onClick={onConfirm}>
          Done
        </Button>
      </DialogFooter>
    </div>
  ),
);
