import { Container } from "@/ui/common/components/Container/Container";
import { Content } from "@/ui/common/components/Content/Content";
import { BTCWalletProvider } from "@/ui/common/context/wallet/BTCWalletProvider";
import { SafeETHWalletProvider } from "@/ui/common/context/wallet/ETHWalletProvider";

import { VaultDashboard } from "./components/VaultDashboard";
import { VaultDemo } from "./components/VaultDemo";

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
            </div>

            <VaultDashboard />
            <VaultDemo />
          </Container>
        </Content>
      </SafeETHWalletProvider>
    </BTCWalletProvider>
  );
}
