import "@/config/env";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import type { Hex } from "viem";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { WithdrawReviewContent } from "@/components/simple/WithdrawFlow/WithdrawReviewContent";
import { WithdrawSelectContent } from "@/components/simple/WithdrawFlow/WithdrawSelectContent";
import { DEBUG_HEALTH_FACTORS } from "@/dev/debugPositionStore";
import { buildCollateralsDemo, COLLATERAL_SCENARIOS } from "@/dev/demoDeposit";
import "@/globals.css";
import Providers from "@/providers";
import { Router } from "@/router";

import { RECORDED_DEPOSITOR } from "./replay/contracts";

initEccLib(ecc);
// The gallery keeps demo vaults out of the transaction flow. Render its real
// content cards here, with the amounts from WithdrawReviewContent.test.tsx.
const vaults = buildCollateralsDemo(
  [
    {
      key: 1,
      type: "collateral",
      stateIndex: COLLATERAL_SCENARIOS.findIndex(
        (scenario) => scenario.key === "col-in-use",
      ),
      amount: "0.6",
      batched: false,
    },
  ],
  true,
).vaults;
const projectedHealthFactor = DEBUG_HEALTH_FACTORS.find(
  (state) => state.label === "Risky",
)!.value;

export function WithdrawRiskHarness() {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [selectedVaultIds, setSelectedVaultIds] = useState(
    vaults.map((vault) => vault.vaultId),
  );
  const selectedBtc = vaults
    .filter((vault) => selectedVaultIds.includes(vault.vaultId))
    .reduce((sum, vault) => sum + vault.amountBtc, 0);
  return (
    <>
      <Router />
      {!open && (
        <button
          className="fixed bottom-4 left-4"
          data-testid="open-withdraw-risk"
          onClick={() => setOpen(true)}
        >
          Open withdrawal risk test
        </button>
      )}
      <V3ModalShell
        open={open}
        onClose={() => setOpen(false)}
        onBack={review ? () => setReview(false) : undefined}
      >
        {review ? (
          <div className="mx-auto w-full max-w-[612px]">
            <WithdrawReviewContent
              totalAmountBtc={selectedBtc}
              totalAmountUsd={21_686.17}
              currentHealthFactor={1.6}
              projectedHealthFactor={projectedHealthFactor}
              payoutAddresses={[RECORDED_DEPOSITOR.BTC_ADDRESS]}
              assertTimelockBlocks={144}
              vpCommission={{
                status: "ready",
                vaultIds: selectedVaultIds as Hex[],
                commissionSats: 1_500_000n,
              }}
              isProcessing={false}
              isConfirming={false}
              unconfirmedWrite={null}
              error={null}
              notice={null}
              hubBlockMessage={null}
              acknowledged={acknowledged}
              onAcknowledgedChange={setAcknowledged}
              onConfirm={() => setOpen(false)}
            />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[564px]">
            <WithdrawSelectContent
              vaults={vaults}
              selectedVaultIds={selectedVaultIds}
              totalAmountBtc={selectedBtc}
              projectedHealthFactor={projectedHealthFactor}
              acknowledged={acknowledged}
              notice={null}
              onToggleVault={(id) =>
                setSelectedVaultIds((ids) =>
                  ids.includes(id)
                    ? ids.filter((value) => value !== id)
                    : [...ids, id],
                )
              }
              onAcknowledgedChange={setAcknowledged}
              onContinue={() => setReview(true)}
            />
          </div>
        )}
      </V3ModalShell>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/vaults"]}>
    <Providers>
      <WithdrawRiskHarness />
    </Providers>
  </MemoryRouter>,
);
