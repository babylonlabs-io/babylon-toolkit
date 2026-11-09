import "@/config/env";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { useQueryClient } from "@tanstack/react-query";
import { initEccLib } from "bitcoinjs-lib";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import type { Address } from "viem";

import { AssetSelectionPanel } from "@/applications/aave/components/AssetSelectionPanel";
import { HubSelectionPanel } from "@/applications/aave/components/HubSelectionPanel";
import { LOAN_PICKER_WIDTH_CLASS } from "@/applications/aave/components/LoanPickerFrame";
import { AaveConfigProvider, useAaveConfig } from "@/applications/aave/context";
import { V3ModalShell } from "@/components/shared/V3ModalShell";
import "@/globals.css";
import Providers from "@/providers";
import { Router } from "@/router";
import {
  AAVE_RESERVE_DRAW_HEADROOM_QUERY_KEY,
  AAVE_RESERVE_LIQUIDITY_QUERY_KEY,
} from "@/utils/queryKeys";

initEccLib(ecc);

export function LoanPickerHoverHarness() {
  const { config, borrowableReserves } = useAaveConfig();
  const client = useQueryClient();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [underlying, setUnderlying] = useState<Address | null>(null);
  const [atCap, setAtCap] = useState(false);
  const reserve = borrowableReserves[0];

  useEffect(() => {
    if (!config || !reserve) return;
    if (reserve.token.symbol !== "USDC" || reserve.reserveId !== 0n)
      throw new Error(
        "The recorded USDC reserve no longer matches the unit fixture.",
      );
    // Use the existing HubSelectionPanel unit case. The recording has no
    // market totals. No RPC response or production query is changed here.
    const assetKey = `${reserve.reserveId}:${reserve.reserve.hub.toLowerCase()}:${reserve.reserve.assetId}`;
    const liquidityKey = `${assetKey}:${reserve.token.decimals}`;
    for (const key of [
      "aaveBorrowAprs",
      "aaveInterestFeeBps",
      "aaveNewBorrowPremiumFraction",
      AAVE_RESERVE_LIQUIDITY_QUERY_KEY,
      AAVE_RESERVE_DRAW_HEADROOM_QUERY_KEY,
    ]) {
      client.setQueryDefaults([key], {
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      });
    }
    client.setQueryData(["aaveBorrowAprs", assetKey], { "0": 4 });
    client.setQueryData(["aaveInterestFeeBps"], 300);
    client.setQueryData(
      [
        "aaveNewBorrowPremiumFraction",
        config.coreSpokeAddress,
        config.vaultBtcReserveId.toString(),
      ],
      0.1,
    );
    client.setQueryData([AAVE_RESERVE_LIQUIDITY_QUERY_KEY, liquidityKey], {
      "0": { availableLiquidity: 35_500_000 },
    });
    client.setQueryData(
      [
        AAVE_RESERVE_DRAW_HEADROOM_QUERY_KEY,
        config.coreSpokeAddress.toLowerCase(),
        liquidityKey,
      ],
      {},
    );
    setReady(true);
  }, [client, config, reserve]);

  const borrowGate = {
    limit: atCap ? 1 : null,
    borrowCount: atCap ? 1n : 0n,
    borrowedReserveIds: new Set<bigint>(),
  };
  return (
    <>
      <Router />
      {!open && ready && (
        <div className="fixed bottom-4 left-4 flex gap-4">
          <label>
            <input
              type="checkbox"
              checked={atCap}
              onChange={(event) => setAtCap(event.target.checked)}
            />
            At borrow limit
          </label>
          <button data-testid="open-loan-hover" onClick={() => setOpen(true)}>
            Open loan picker test
          </button>
        </div>
      )}
      <V3ModalShell
        open={open}
        onClose={() => setOpen(false)}
        onBack={underlying ? () => setUnderlying(null) : undefined}
        contentClassName={LOAN_PICKER_WIDTH_CLASS}
      >
        {underlying ? (
          <HubSelectionPanel
            underlying={underlying}
            onSelectReserve={() => setOpen(false)}
            borrowGate={borrowGate}
          />
        ) : (
          <AssetSelectionPanel
            onSelectAsset={setUnderlying}
            borrowGate={borrowGate}
          />
        )}
      </V3ModalShell>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/loans"]}>
    <Providers>
      <AaveConfigProvider>
        <LoanPickerHoverHarness />
      </AaveConfigProvider>
    </Providers>
  </MemoryRouter>,
);
