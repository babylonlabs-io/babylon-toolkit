import { Card, useIsMobile, Tabs } from "@babylonlabs-io/core-ui";
import { DepositOverview } from "./DepositOverview";
import { MarketOverview } from "./MarketOverview";

export function VaultOverviewPanel() {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Deposits
          </h3>
          <DepositOverview />
        </Card>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Markets
          </h3>
          <MarketOverview />
        </Card>
      </>
    );
  }

  return (
    <Card>
      <Tabs
        items={[
          {
            id: "deposits",
            label: "Deposits",
            content: <DepositOverview />,
          },
          {
            id: "markets",
            label: "Markets",
            content: <MarketOverview />,
          },
        ]}
        defaultActiveTab="deposits"
      />
    </Card>
  );
}

