import "@/config/env";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { buildDepositsDemo } from "@/dev/demoDeposit";
import "@/globals.css";
import Providers from "@/providers";
import { Router } from "@/router";

initEccLib(ecc);
// The recording has no active vault. Mount its production download component
// with existing gallery inputs, inside the real app shell and providers.
const activity = buildDepositsDemo(
  [
    {
      key: 1,
      type: "deposit",
      stateIndex: 12,
      amount: "0.0375",
      batched: false,
    },
  ],
  true,
).pendingActivities[0];

function ArtifactDownloadHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Router />
      {!open && (
        <button
          className="fixed bottom-4 left-4"
          data-testid="open-artifact-download"
          onClick={() => setOpen(true)}
        >
          Open artifact download test
        </button>
      )}
      {open && (
        <ArtifactDownloadModal
          vaultId={activity.id}
          providerAddress={activity.providers[0].id}
          peginTxid={activity.peginTxHash!}
          depositorPk={activity.depositorBtcPubkey!}
          unsignedPrePeginTxHex={activity.unsignedPrePeginTx ?? ""}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/vaults"]}>
    <Providers>
      <ArtifactDownloadHarness />
    </Providers>
  </MemoryRouter>,
);
