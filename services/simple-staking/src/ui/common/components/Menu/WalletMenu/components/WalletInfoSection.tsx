import { Avatar, Text } from "@babylonlabs-io/core-ui";

import bbnIcon from "@/ui/common/assets/bbn.svg";
import bitcoin from "@/ui/common/assets/bitcoin.png";
import { Hash } from "@/ui/common/components/Hash/Hash";
import { CopyIcon } from "@/ui/common/components/Icons";

interface WalletInfoProps {
  btcAddress: string;
  bbnAddress: string;
  selectedWallets: Record<string, { name: string; icon: string }>;
}

export const WalletInfoSection = ({
  btcAddress,
  bbnAddress,
  selectedWallets,
}: WalletInfoProps) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Bitcoin Wallet */}
      <div className="rounded-[4px] bg-secondary-highlight p-4 dark:bg-secondary-strokeLight">
        <div className="flex w-full flex-col">
          <div className="mb-3 flex justify-start">
            <Avatar
              alt={selectedWallets["BTC"]?.name || "Bitcoin"}
              url={selectedWallets["BTC"]?.icon || bitcoin}
              size="large"
              className="h-10 w-10"
            />
          </div>

          <div className="mb-[1px] flex justify-start">
            <Text
              variant="body1"
              className="text-xs font-medium text-accent-secondary"
            >
              Bitcoin Wallet
            </Text>
          </div>

          <div className="flex w-full items-center justify-between">
            <Hash
              className="min-w-0 flex-1 text-sm text-accent-primary"
              value={btcAddress}
              address
              noFade
              symbols={12}
              noCopy
            />
            <button
              onClick={() => copyToClipboard(btcAddress)}
              className="hover:bg-surface-tertiary ml-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded p-1 transition-colors hover:opacity-80"
            >
              <CopyIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Babylon Wallet */}
      <div className="rounded bg-secondary-highlight p-4 dark:bg-secondary-strokeLight">
        <div className="flex w-full flex-col">
          <div className="mb-3 flex justify-start">
            <Avatar
              alt={selectedWallets["BBN"]?.name || "Babylon"}
              url={selectedWallets["BBN"]?.icon || bbnIcon}
              size="large"
              className="h-10 w-10"
            />
          </div>

          <div className="mb-[1px] flex justify-start">
            <Text
              variant="body1"
              className="text-xs font-medium text-accent-secondary"
            >
              Babylon Wallet
            </Text>
          </div>

          <div className="flex w-full items-center justify-between">
            <Hash
              className="min-w-0 flex-1 text-sm text-accent-primary"
              value={bbnAddress}
              address
              noFade
              symbols={12}
              noCopy
            />
            <button
              onClick={() => copyToClipboard(bbnAddress)}
              className="hover:bg-surface-tertiary ml-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded p-1 transition-colors hover:opacity-80"
            >
              <CopyIcon size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
