import "@/config/env";
import { FullScreenDialog } from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { AaveConfigProvider } from "@/applications/aave/context";
import { VaultProviderSelectorV3 } from "@/components/simple/VaultProviderSelectorV3";
import "@/globals.css";
import { useVaultProviders } from "@/hooks/deposit/useVaultProviders";
import Providers from "@/providers";
import { Router } from "@/router";
import type { VaultProviderListItem } from "@/types/vaultProvider";

const older: VaultProviderListItem = {
  id: "0xolder",
  name: "Older",
  btcPubkey: "0xpub",
  unavailable: false,
  unhealthy: false,
  lastSuccessfulPeginAt: 1000,
  explorerUrl: "https://explorer.example/provider/0xolder",
};

function ProviderColumns() {
  const { allVaultProviders, unhealthyVpIds, loading } = useVaultProviders(
    undefined,
    { requireCompleteKeeperRoster: false },
  );
  const [selectedProvider, setSelectedProvider] = useState("");
  const [expanded, setExpanded] = useState(true);
  const providers: VaultProviderListItem[] = allVaultProviders.map(
    (provider) => ({
      id: provider.id,
      name: provider.name ?? provider.id,
      btcPubkey: provider.btcPubKey,
      unavailable: provider.metadataStatus !== "ok",
      unhealthy: unhealthyVpIds.has(provider.id.toLowerCase()),
    }),
  );
  return (
    <FullScreenDialog open className="items-center justify-center p-4">
      <div
        data-testid="provider-columns-fixture"
        style={{ width: "100%", maxWidth: 600 }}
      >
        <VaultProviderSelectorV3
          providers={[...providers, older]}
          isLoadingProviders={loading}
          selectedProvider={selectedProvider}
          onProviderSelect={setSelectedProvider}
          expanded={expanded}
          onExpandedChange={setExpanded}
        />
      </div>
    </FullScreenDialog>
  );
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/vaults"]}>
    <Providers>
      <Router />
      <AaveConfigProvider>
        <ProviderColumns />
      </AaveConfigProvider>
    </Providers>
  </MemoryRouter>,
);
