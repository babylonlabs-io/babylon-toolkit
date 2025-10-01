import { initBTCCurve } from "@babylonlabs-io/btc-staking-ts";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { Card } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { useHealthCheck } from "@/ui/common/hooks/useHealthCheck";

import { Activity } from "./components/Activity/Activity";
import { Container } from "./components/Container/Container";
import { FAQ } from "./components/FAQ/FAQ";
import { MultistakingFormWrapper } from "./components/Multistaking/MultistakingForm/MultistakingFormWrapper";
import { Stats } from "./components/Stats/Stats";
import { Tabs } from "./components/Tabs";

const Home = () => {
  const [activeTab, setActiveTab] = useState("stake");

  useEffect(() => {
    initBTCCurve();
  }, []);

  const { connected } = useWalletConnect();
  const { isGeoBlocked, isLoading } = useHealthCheck();
  const isConnected = connected && !isGeoBlocked && !isLoading;

  // Reset tab to "stake" when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setActiveTab("stake");
    }
  }, [connected]);

  const tabItems = [
    {
      id: "stake",
      label: "Stake",
      content: <MultistakingFormWrapper />,
    },
    ...(isConnected
      ? [
          {
            id: "activity",
            label: "Activity",
            content: <Activity />,
          },
        ]
      : []),
    {
      id: "faqs",
      label: "FAQs",
      content: <FAQ variant="btc" />,
    },
  ];

  return (
    <Card className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-[3rem] bg-surface px-4 max-md:border-0 max-md:p-0">
      <Container
        as="main"
        className="mx-auto flex max-w-[760px] flex-1 flex-col gap-[3rem]"
      >
        <Stats />
        <Tabs
          items={tabItems}
          defaultActiveTab="stake"
          activeTab={activeTab}
          onTabChange={setActiveTab}
          keepMounted
        />
      </Container>
    </Card>
  );
};

export default Home;
