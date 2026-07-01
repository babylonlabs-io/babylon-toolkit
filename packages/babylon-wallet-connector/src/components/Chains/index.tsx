import { Button, Heading, Text } from "@babylonlabs-io/core-ui";
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
  onConfirm?: () => void;
  onSelectChain?: (chain: IChain) => void;
}

export const Chains = memo(
  ({ disabled = false, chains, selectedWallets = {}, className, onConfirm, onSelectChain }: ChainsProps) => (
    <div
      className={twMerge(
        "flex flex-col overflow-hidden rounded-2xl border border-secondary-strokeLight text-accent-primary",
        className,
      )}
    >
      <div className="border-b border-secondary-strokeLight p-6">
        <Heading variant="h5" className="text-accent-primary">
          Connect Wallets
        </Heading>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          {chains.map((chain) => {
            const selectedWallet = selectedWallets[chain.id];

            return (
              <ChainButton
                key={chain.id}
                title={`Select ${chain.name} Wallet`}
                logo={chain.icon}
                alt={chain.name}
                onClick={() => void onSelectChain?.(chain)}
              >
                {selectedWallet && (
                  <ConnectedWallet logo={selectedWallet.icon} address={selectedWallet.account?.address ?? ""} />
                )}
              </ChainButton>
            );
          })}

          <Button
            color="secondary"
            disabled={disabled}
            fluid
            onClick={onConfirm}
            className="text-sm"
            data-testid="chains-connect-button"
          >
            Connect
          </Button>
        </div>

        <Text variant="body2" className="text-center text-accent-secondary">
            By clicking Connect you agree with the{" "}
            <a
              href="https://babylonlabs.io/terms-of-use"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-primary underline"
            >
              Terms of Use
            </a>{" "}
            and{" "}
            <a
              href="https://babylonlabs.io/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-primary underline"
            >
              Privacy Policy
            </a>
            .
        </Text>
      </div>
    </div>
  ),
);
