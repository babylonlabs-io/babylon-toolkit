/**
 * Activity Page
 * Displays aggregated user activities across all applications
 */

import { Card, Container, Loader } from "@babylonlabs-io/core-ui";
import type { Hex } from "viem";

import { useETHWallet } from "../../context/wallet";
import { useActivitiesWithPending } from "../../hooks/useActivitiesWithPending";
import { ActivityEmptyState, ActivityTable } from "../Activity";

export default function Activity() {
  const { address, connected } = useETHWallet();
  const { data: activities, isLoading } = useActivitiesWithPending(
    address as Hex,
  );

  const hasActivities = activities && activities.length > 0;

  return (
    <Container
      as="main"
      className="mx-auto flex flex-1 flex-col gap-6 px-4 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0"
    >
      <Card className="w-full">
        <div className="w-full space-y-6">
          <h2 className="text-[24px] font-normal text-accent-primary">
            Activity
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader />
            </div>
          ) : hasActivities ? (
            <ActivityTable activities={activities} />
          ) : (
            <ActivityEmptyState isConnected={connected} />
          )}
        </div>
      </Card>
    </Container>
  );
}
