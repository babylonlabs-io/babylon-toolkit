import { Card, useIsMobile, Tabs } from "@babylonlabs-io/core-ui";
import { DepositOverview } from "./DepositOverview";
import { MarketOverview } from "./MarketOverview";
import { PositionOverview } from "./PositionOverview";
import { ActivityOverview } from "./ActivityOverview";

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
            Your Positions
          </h3>
          <PositionOverview />
        </Card>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Markets
          </h3>
          <MarketOverview />
        </Card>
        <Card>
          <h3 className="mb-4 text-xl font-normal text-accent-primary md:mb-6">
            Activity
          </h3>
          <ActivityOverview />
        </Card>
      </>
    );
  }

  return (
    <div>
      <Tabs
        items={[
          {
            id: "deposits",
            label: "Deposits",
            content: <DepositOverview />,
          },
          {
            id: "positions",
            label: "Positions",
            content: <PositionOverview />,
          },
          {
            id: "markets",
            label: "Markets",
            content: <MarketOverview />,
          },
          {
            id: "activity",
            label: "Activity",
            content: <ActivityOverview />,
          },
        ]}
        defaultActiveTab="deposits"
      />
    </div>
  );
}

