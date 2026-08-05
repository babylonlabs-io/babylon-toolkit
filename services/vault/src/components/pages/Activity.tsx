import { Container, Loader } from "@babylonlabs-io/core-ui";
import type { Hex } from "viem";

import { ActivityListWithRefund } from "@/components/Activity/ActivityListWithRefund";

import { useConnection, useETHWallet } from "../../context/wallet";
import { useActivitiesWithPending } from "../../hooks/useActivitiesWithPending";
import { PAGE_CONTENT_CLASS } from "../shared/layoutClasses";

export default function Activity() {
  const { address } = useETHWallet();
  const { isConnected } = useConnection();
  // God-mode demo rows are merged in by this hook (dev only), so the feed can
  // be exercised without a wallet or an indexed history. The panel itself is
  // mounted once by the route (see dev/GodModeMount), not per page.
  const { data: activities, isLoading } = useActivitiesWithPending(
    isConnected ? (address as Hex) : undefined,
  );

  const rows = activities ?? [];

  return (
    <Container
      as="main"
      className={`${PAGE_CONTENT_CLASS} flex flex-1 flex-col gap-6 pb-6 max-md:flex-none max-md:gap-4 max-md:pb-4 max-md:pt-0`}
    >
      <div className="w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader />
          </div>
        ) : (
          <ActivityListWithRefund activities={rows} isConnected={isConnected} />
        )}
      </div>
    </Container>
  );
}
