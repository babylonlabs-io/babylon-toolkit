import { useAppKitAccount } from "@reown/appkit/react";
import { useDisconnect } from "wagmi";

import { Container } from "@/ui/common/components/Container/Container";
import { Content } from "@/ui/common/components/Content/Content";
import { BTCWalletProvider } from "@/ui/common/context/wallet/BTCWalletProvider";
import { SafeETHWalletProvider } from "@/ui/common/context/wallet/ETHWalletProvider";

/**
 * AppKit Disconnect Button Component
 */
function AppKitDisconnectButton() {
  const { isConnected, address } = useAppKitAccount();
  const { disconnect } = useDisconnect();

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error("Failed to disconnect AppKit wallet:", error);
    }
  };

  if (!isConnected || !address) {
    return null;
  }

  return (
    <div className="mb-2 mt-2 flex items-center justify-center gap-3">
      <span className="text-sm text-gray-600">
        Connected: {address.slice(0, 6)}...{address.slice(-4)}
      </span>
      <button
        onClick={handleDisconnect}
        className="rounded border border-red-200 px-3 py-1 text-sm text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
      >
        Disconnect
      </button>
    </div>
  );
}

/**
 * Vault Layout - Dual-chain wallet application
 *
 * This layout provides access to both BTC and ETH wallets for demonstration
 * of the AppKit integration and dual-chain functionality.
 */
export default function VaultLayout() {
  return (
    <BTCWalletProvider>
      <SafeETHWalletProvider>
        <Content>
          <Container className="mx-auto flex max-w-[1200px] flex-1 flex-col gap-8 py-8">
            <div className="text-center">
              <h1 className="mb-2 text-3xl font-bold text-primary-main">
                Babylon Vault
              </h1>
              <p className="text-gray-600">
                Dual-chain wallet demo with BTC and ETH support
              </p>
              <AppKitDisconnectButton />
            </div>
          </Container>
        </Content>
      </SafeETHWalletProvider>
    </BTCWalletProvider>
  );
}
