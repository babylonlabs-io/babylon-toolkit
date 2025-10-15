import { useState, useMemo } from "react";
import { VaultLayout as VaultDeposit, VaultPositions } from "@routes/vault";

import { Container } from "@/ui/common/components/Container/Container";
import { Content } from "@/ui/common/components/Content/Content";
import { Section } from "@/ui/common/components/Section/Section";
import { Tabs } from "@/ui/common/components/Tabs";
import { BTCWalletProvider, useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { SafeETHWalletProvider, useETHWallet } from "@/ui/common/context/wallet/ETHWalletProvider";

type TabId = "deposit" | "positions";

/**
 * Inner component that has access to wallet contexts
 */
function VaultContent() {
  const [activeTab, setActiveTab] = useState<TabId>("deposit");
  const { address: ethAddress, connected: ethConnected } = useETHWallet();
  const { address: btcAddress, connected: btcConnected } = useBTCWallet();
  
  // Log wallet states to debug the connection issue
  console.log("[VaultLayout] Wallet states from providers:", JSON.stringify({
    ethAddress: ethAddress ? `${ethAddress.substring(0, 6)}...` : null,
    ethConnected,
    btcAddress: btcAddress ? `${btcAddress.substring(0, 6)}...` : null,
    btcConnected,
    isWalletConnected: ethConnected && btcConnected
  }));

  const tabItems = useMemo(
    () => [
      {
        id: "deposit",
        label: "Deposit",
        content: (
          <Section>
            <VaultDeposit 
              ethAddress={ethAddress}
              btcAddress={btcAddress}
              isWalletConnected={ethConnected && btcConnected}
            />
          </Section>
        ),
      },
      {
        id: "positions",
        label: "Positions",
        content: (
          <Section>
            <VaultPositions 
              ethAddress={ethAddress}
              btcAddress={btcAddress}
              isWalletConnected={ethConnected && btcConnected}
            />
          </Section>
        ),
      },
    ],
    [ethAddress, btcAddress, ethConnected, btcConnected]
  );

  return (
    <Content>
      <Container className="mx-auto flex max-w-[1200px] flex-1 flex-col gap-8 py-8">
        <Tabs
          items={tabItems}
          defaultActiveTab="deposit"
          activeTab={activeTab}
          onTabChange={(tabId) => setActiveTab(tabId as TabId)}
          keepMounted
        />
      </Container>
    </Content>
  );
}

/**
 * Vault Layout Wrapper - Dual-chain wallet application
 *
 * This wrapper provides the wallet providers (BTC and ETH) for the vault
 * and handles tab navigation between Deposit and Positions views.
 */
export default function VaultLayout() {
  return (
    <BTCWalletProvider>
      <SafeETHWalletProvider>
        <VaultContent />
      </SafeETHWalletProvider>
    </BTCWalletProvider>
  );
}
