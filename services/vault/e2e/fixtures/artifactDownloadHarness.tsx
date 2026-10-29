import "@/config/env";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { ActivateConfirmationModal } from "@/components/simple/ActivateConfirmationModal";
import { COPY } from "@/copy";
import { buildDepositsDemo } from "@/dev/demoDeposit";
import "@/globals.css";
import {
  getArtifactDownloadOverride,
  setArtifactDownloadOverride,
} from "@/overrides/artifactDownload";
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
const params = new URLSearchParams(window.location.search);
const DownloadModal =
  params.get("surface") === "activation"
    ? ActivateConfirmationModal
    : ArtifactDownloadModal;

function ArtifactDownloadHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Router />
      {!open && (
        <button
          className="fixed bottom-4 left-4"
          data-testid="open-artifact-download"
          onClick={() => {
            if (params.has("quota")) {
              const download = getArtifactDownloadOverride();
              setArtifactDownloadOverride(async () => {
                setArtifactDownloadOverride(download);
                throw new Error(
                  COPY.deposit.recoveryArtifacts.downloadLimitReached,
                );
              });
            }
            setOpen(true);
          }}
        >
          Open artifact download test
        </button>
      )}
      {open && (
        <DownloadModal
          open
          simulateProviderLiveness
          vaultId={activity.id}
          providerAddress={activity.providers[0].id}
          peginTxid={activity.peginTxHash!}
          depositorPk={activity.depositorBtcPubkey!}
          unsignedPrePeginTxHex={activity.unsignedPrePeginTx ?? ""}
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
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
