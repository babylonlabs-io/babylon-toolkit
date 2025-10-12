import { useState, useMemo } from "react";
import { VaultLayout as VaultDeposit, VaultPositions } from "@routes/vault";

import { Container } from "@/ui/common/components/Container/Container";
import { Content } from "@/ui/common/components/Content/Content";
import { Section } from "@/ui/common/components/Section/Section";
import { Tabs } from "@/ui/common/components/Tabs";
import { BTCWalletProvider } from "@/ui/common/context/wallet/BTCWalletProvider";
import { SafeETHWalletProvider } from "@/ui/common/context/wallet/ETHWalletProvider";

type TabId = "deposit" | "positions";

/**
 * Vault Layout Wrapper - Dual-chain wallet application
 *
 * This wrapper provides the wallet providers (BTC and ETH) for the vault
 * and handles tab navigation between Deposit and Positions views.
 */
export default function VaultLayout() {
  const [activeTab, setActiveTab] = useState<TabId>("deposit");

  const tabItems = useMemo(
    () => [
      {
        id: "deposit",
        label: "Deposit",
        content: (
          <Section>
            <VaultDeposit />
          </Section>
        ),
      },
      {
        id: "positions",
        label: "Positions",
        content: (
          <Section>
            <VaultPositions />
          </Section>
        ),
      },
    ],
    []
  );

  return (
    <BTCWalletProvider>
      <SafeETHWalletProvider>
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
      </SafeETHWalletProvider>
    </BTCWalletProvider>
  );
}
