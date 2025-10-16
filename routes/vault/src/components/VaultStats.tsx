import { Card, List, StatItem } from "@babylonlabs-io/core-ui";
import { memo } from "react";

export const VaultStats = memo(() => {
  const supplyTVL = 350;
  const borrowTVL = 175;
  const protocolLTV = 321;

  return (
    <Card className="max-md:border-0 max-md:p-0">
      <h3 className="text-accent-primary mb-4 text-2xl font-normal capitalize md:mb-6">
        Stats
      </h3>
      <div className="overflow-x-auto md:overflow-visible">
        <List orientation="horizontal" className="md:flex-row">
          <StatItem title="Supply TVL" value={`$${supplyTVL}m`} />
          <StatItem title="Borrow TVL" value={`$${borrowTVL}m`} />
          <StatItem title="Protocol LTV" value={`${protocolLTV}%`} />
        </List>
      </div>
    </Card>
  );
});

VaultStats.displayName = "VaultStats";
