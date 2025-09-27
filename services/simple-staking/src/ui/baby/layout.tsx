import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { useEffect, useState } from "react";
import { Card } from "@babylonlabs-io/core-ui";

import { DelegationState } from "@/ui/baby/state/DelegationState";
import { RewardState } from "@/ui/baby/state/RewardState";
import { StakingState } from "@/ui/baby/state/StakingState";
import { ValidatorState } from "@/ui/baby/state/ValidatorState";
import { AuthGuard } from "@/ui/common/components/Common/AuthGuard";
import { Container } from "@/ui/common/components/Container/Container";
import { Content } from "@/ui/common/components/Content/Content";
import { FAQ } from "@/ui/common/components/FAQ/FAQ";
import { Section } from "@/ui/common/components/Section/Section";
import { Tabs } from "@/ui/common/components/Tabs";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useHealthCheck } from "@/ui/common/hooks/useHealthCheck";
import FF from "@/ui/common/utils/FeatureFlagService";

import { Stats } from "./components/Stats/Stats";
import { BabyActivityList } from "./components/ActivityList";
import { RewardCard } from "./components/RewardCard";
import { RewardsPreviewModal } from "./components/RewardPreviewModal";
import CoStakingBoostSection from "./components/CoStakingBoostSection";
import { useEpochPolling } from "./hooks/api/useEpochPolling";
import { PendingOperationsProvider } from "./hooks/services/usePendingOperationsService";
import StakingForm from "./widgets/StakingForm";

export type TabId = "stake" | "activity" | "rewards" | "faqs";

export default function BabyLayout() {
  return (
    <PendingOperationsProvider>
      <BabyLayoutContent />
    </PendingOperationsProvider>
  );
}

function BabyLayoutContent() {
  const [activeTab, setActiveTab] = useState<TabId>("stake");
  const { connected } = useWalletConnect();
  const { isGeoBlocked, isLoading } = useHealthCheck();
  const { bech32Address } = useCosmosWallet();
  const isConnected = connected && !isGeoBlocked && !isLoading;
  useEffect(() => {
    if (!connected) {
      setActiveTab("stake");
    }
  }, [connected]);

  useEffect(() => {
    if (isGeoBlocked && (activeTab === "activity" || activeTab === "rewards")) {
      setActiveTab("stake");
    }
  }, [isGeoBlocked, activeTab]);

  // Enable epoch polling to refetch delegations when epoch changes
  useEpochPolling(bech32Address);

  const RewardsTab: React.FC = () => {
    return (
      <Section>
        <RewardCard />
        <RewardsPreviewModal />
      </Section>
    );
  };

  const tabItems = [
    {
      id: "stake",
      label: "Stake",
      content: <StakingForm isGeoBlocked={isGeoBlocked} />,
    },
    ...(isConnected
      ? [
          {
            id: "activity",
            label: "Activity",
            content: (
              <Section>
                <BabyActivityList />
              </Section>
            ),
          },
          {
            id: "rewards",
            label: "Rewards",
            content: <RewardsTab />,
          },
        ]
      : []),
    {
      id: "faqs",
      label: "FAQs",
      content: <FAQ variant="baby" />,
    },
  ];

  const fallbackTabItems = [
    {
      id: "stake",
      label: "Stake",
      content: <StakingForm isGeoBlocked={isGeoBlocked} />,
    },
    {
      id: "faqs",
      label: "FAQs",
      content: <FAQ variant="baby" />,
    },
  ];

  const fallbackContent = (
    <Container
      as="main"
      className="mx-auto flex max-w-[760px] flex-1 flex-col gap-[3rem] pb-0"
    >
      <Stats />
      <CoStakingBoostSection setActiveTab={setActiveTab} />
      <Tabs items={fallbackTabItems} defaultActiveTab="stake" keepMounted />
    </Container>
  );

  return (
    <StakingState>
      <ValidatorState>
        <DelegationState>
          <RewardState>
            <Content>
              <Card className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-[3rem] bg-surface px-4 max-md:border-0 max-md:p-0">
                <AuthGuard fallback={fallbackContent} geoBlocked={isGeoBlocked}>
                  <Container
                    as="main"
                    className="mx-auto flex max-w-[760px] flex-1 flex-col gap-4 pb-0"
                  >
                    <Stats />
                    {FF.IsCoStakingEnabled && (
                      <CoStakingBoostSection setActiveTab={setActiveTab} />
                    )}
                    <Tabs
                      items={tabItems}
                      defaultActiveTab="stake"
                      activeTab={activeTab}
                      onTabChange={(tabId) => setActiveTab(tabId as TabId)}
                    />
                  </Container>
                </AuthGuard>
              </Card>
            </Content>
          </RewardState>
        </DelegationState>
      </ValidatorState>
    </StakingState>
  );
}
