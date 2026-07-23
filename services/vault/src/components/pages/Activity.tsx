import { Container, Loader } from "@babylonlabs-io/core-ui";
import { lazy, Suspense } from "react";
import type { Hex } from "viem";

import { FeatureFlags } from "@/config";

import { useConnection, useETHWallet } from "../../context/wallet";
import { useActivitiesWithPending } from "../../hooks/useActivitiesWithPending";
import { ActivityList } from "../Activity";
import { PAGE_CONTENT_CLASS } from "../shared/layoutClasses";

// Dev-only god-mode panel, lazily imported behind `import.meta.env.DEV` so its
// code is dropped from production builds entirely (same pattern as VaultsPage).
const GodModePanel = import.meta.env.DEV
  ? lazy(() =>
      import("@/dev/GodModePanel").then((m) => ({ default: m.GodModePanel })),
    )
  : null;

export default function Activity() {
  const { address } = useETHWallet();
  const { isConnected } = useConnection();
  const { data: activities, isLoading } = useActivitiesWithPending(
    isConnected ? (address as Hex) : undefined,
  );

  const isDevToolingEnabled =
    import.meta.env.DEV && FeatureFlags.isGodModePanelEnabled;

  // Dev/QA god-mode panel (same gate and pattern as VaultsPage) so demo items
  // can be injected without navigating back to the Vaults page.
  const godModePanel =
    isDevToolingEnabled && GodModePanel ? (
      <Suspense fallback={null}>
        <GodModePanel />
      </Suspense>
    ) : null;

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
          <ActivityList
            activities={activities ?? []}
            isConnected={isConnected}
          />
        )}
      </div>
      {godModePanel}
    </Container>
  );
}
