import "@/config/env";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { ActivateConfirmationModal } from "@/components/simple/ActivateConfirmationModal";
import { VaultsActiveSection } from "@/components/vaults/VaultsActiveSection";
import { useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import {
  buildCollateralsDemo,
  buildDepositsDemo,
  COLLATERAL_SCENARIOS,
} from "@/dev/demoDeposit";
import "@/globals.css";
import {
  getArtifactDownloadOverride,
  setArtifactDownloadOverride,
} from "@/overrides/artifactDownload";
import Providers from "@/providers";
import { Router } from "@/router";
import {
  normalizePeginTxid,
  saveArtifactDownloadReceipt,
} from "@/utils/artifactDownloadStorage";

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
// `?saved` opens the dialog on a vault whose artifacts this browser saved.
if (params.has("saved")) {
  saveArtifactDownloadReceipt(activity.id, {
    version: 1,
    peginTxid: normalizePeginTxid(activity.peginTxHash!),
    filename: "artifacts.tar",
    byteLength: 1,
    sha256: "00".repeat(32),
    savedAt: 1,
    method: "file-system-access",
  });
}
// `?savedRow` shows an active vault row whose artifacts this browser saved. The
// demo entry is display-only and has no Pre-PegIn tx, which hides the action,
// so the row gets the inputs a real vault carries.
const savedRowVault = {
  ...buildCollateralsDemo(
    [
      {
        key: 2,
        type: "collateral",
        stateIndex: COLLATERAL_SCENARIOS.findIndex(
          (scenario) => scenario.key === "col-in-use",
        ),
        amount: "0.0375",
        batched: false,
      },
    ],
    true,
  ).vaults[0],
  displayOnly: false,
  unsignedPrePeginTx: `0x${"bc".repeat(32)}`,
};
if (params.has("savedRow")) {
  saveArtifactDownloadReceipt(savedRowVault.vaultId, {
    version: 1,
    peginTxid: normalizePeginTxid(savedRowVault.peginTxHash!),
    filename: "artifacts.tar",
    byteLength: 1,
    sha256: "00".repeat(32),
    savedAt: 1,
    method: "file-system-access",
  });
}
const DownloadModal =
  params.get("surface") === "activation"
    ? ActivateConfirmationModal
    : ArtifactDownloadModal;

function ArtifactDownloadHarness() {
  const [open, setOpen] = useState(false);
  const { address } = useETHWallet();
  if (params.has("savedRow")) {
    // Under the app shell, which the capture guards require.
    return (
      <>
        <Router />
        <div className="mx-auto w-full max-w-[1200px] p-4">
          <VaultsActiveSection
            vaults={[savedRowVault]}
            onWithdraw={() => {}}
            onDownloadArtifacts={() => {}}
            isWithdrawDisabled={false}
            ethAddress={address}
          />
        </div>
      </>
    );
  }
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
