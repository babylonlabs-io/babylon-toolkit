// Funding-input-cap contract: `useEstimatedBtcFee` derives its `maxDeposit`
// from `computeMaxDeposit` over a UTXO set capped to
// MAX_PRE_PEGIN_FUNDING_INPUTS (20) — the most a Pre-PegIn may spend. This
// test reproduces that same capped-set computation and checks it against the
// real `selectUtxosForPegin`, so a drift between the two (e.g. estimating
// against more inputs than a build can actually select) fails a real
// fee/selection round-trip rather than a mocked one.
//
// Deliberately run in the `contracts` project (`services/vault/vitest.config.ts`),
// not the jsdom `unit` project: `selectUtxosForPegin` decompiles each UTXO's
// script via bitcoinjs-lib, and under the app's jsdom test environment that
// throws "Expected Buffer, got Buffer" — a pnpm dual-package hazard (two
// resolved `buffer` package instances: `buffer@5.7.1` and `buffer@6.0.3`)
// that only reproduces under jsdom, confirmed with a throwaway probe test in
// each project. The `contracts` project's plain Node environment resolves a
// single `buffer` instance, so the real call here is unaffected. This file
// therefore imports no vault module, matching the project's convention.

import {
  computeMaxDeposit,
  selectUtxosForPegin,
  type UTXO,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { describe, expect, it } from "vitest";

const MAX_PRE_PEGIN_FUNDING_INPUTS = 20;

function capFundingUtxos(utxos: readonly UTXO[]): UTXO[] {
  return [...utxos]
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_PRE_PEGIN_FUNDING_INPUTS);
}

// A fixed valid P2TR scriptPubKey — only value/txid vary across fixtures.
const VALID_P2TR_SCRIPT =
  "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

// 25 distinct-valued UTXOs. The 20 largest (60,000..250,000 sats) sum to
// 3,100,000 sats; the 5 excluded (10,000..50,000) sum to 150,000 — enough
// that capping actually changes the funding set, not just its order.
const UTXOS: UTXO[] = Array.from({ length: 25 }, (_, i) => ({
  txid: i.toString(16).padStart(64, "0"),
  vout: 0,
  value: (i + 1) * 10_000,
  scriptPubKey: VALID_P2TR_SCRIPT,
}));

const NUM_OUTPUTS = 2;
const FEE_RATE = 5;

describe("funding-input-cap estimator/selection agreement (real SDK)", () => {
  it("computes a maxDeposit fundable from the capped set, and rejects one sat more", () => {
    const cappedUtxos = capFundingUtxos(UTXOS);
    expect(cappedUtxos).toHaveLength(MAX_PRE_PEGIN_FUNDING_INPUTS);

    const totalBalance = cappedUtxos.reduce(
      (sum, u) => sum + BigInt(u.value),
      0n,
    );
    const maxDeposit = computeMaxDeposit({
      numInputs: cappedUtxos.length,
      numOutputs: NUM_OUTPUTS,
      totalBalance,
      feeRate: FEE_RATE,
    });
    expect(maxDeposit).not.toBeNull();
    expect(maxDeposit).toBeGreaterThan(0n);

    const selection = selectUtxosForPegin(
      cappedUtxos,
      maxDeposit as bigint,
      FEE_RATE,
      NUM_OUTPUTS,
    );
    expect(selection.selectedUTXOs.length).toBeLessThanOrEqual(
      MAX_PRE_PEGIN_FUNDING_INPUTS,
    );

    expect(() =>
      selectUtxosForPegin(
        cappedUtxos,
        (maxDeposit as bigint) + 1n,
        FEE_RATE,
        NUM_OUTPUTS,
      ),
    ).toThrow();
  });
});
