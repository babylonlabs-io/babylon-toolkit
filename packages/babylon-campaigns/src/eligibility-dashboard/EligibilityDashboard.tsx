import React from "react";
import { Card, Heading, Button } from "@babylonlabs-io/core-ui";

export interface EligibilityDashboardProps {
  className?: string;
}

export const EligibilityDashboard: React.FC<EligibilityDashboardProps> = ({
  className = "",
}) => {
  return (
    <div className={`eligibility-dashboard ${className}`}>
      <Card className="p-6">
        <Heading variant="h2" className="mb-4 text-accent-primary">
          Eligibility Dashboard
        </Heading>
        <div className="mt-6">
          <Button onClick={() => {}} variant="outlined">
            Check eligibility
          </Button>
        </div>
      </Card>
    </div>
  );
};