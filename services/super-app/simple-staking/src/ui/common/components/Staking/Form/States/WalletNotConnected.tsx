import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";

import walletIcon from "./wallet-icon.svg";

export const WalletNotConnected = () => {
  const { open } = useBTCWallet();
  const { coinName } = getNetworkConfigBTC();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <div className="rotate-12">
        <img src={walletIcon} alt="Wallet" width={120} height={122} />
      </div>

      <div className="text-center">
        <Heading variant="h5" className="mb-2 text-2xl text-accent-primary">
          Connect wallets to start staking
        </Heading>
        <Text
          variant="body1"
          className="p-0 text-center text-base text-accent-secondary"
        >
          To start staking your {coinName} first connect wallets then select a
          Finality Provider
        </Text>
      </div>

      <Button variant="outlined" onClick={open} className="text-primary-dark">
        Connect Wallets
      </Button>
    </div>
  );
};
