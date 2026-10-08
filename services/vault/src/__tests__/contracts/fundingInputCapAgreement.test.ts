// Funding-input-cap contract: `useEstimatedBtcFee` derives its `maxDeposit`
// from `computeMaxDeposit` over the real `capFundingUtxos` set — the most a
// Pre-PegIn may spend. This test runs that production helper against the real
// `selectUtxosForPegin`, drives the selection on through the real
// `fundPeginTransaction`, and checks the fee covers the funded transaction's
// virtual size with a signature-sized witness on every input. A drift between
// the estimator and the real size of what a build selects and funds therefore
// fails a real round-trip rather than a mocked one.
//
// Deliberately run in the `contracts` project (`services/vault/vitest.config.ts`),
// not the jsdom `unit` project: `selectUtxosForPegin` decompiles each UTXO's
// script via the SDK's own bitcoinjs-lib, and under the app's jsdom test
// environment that throws "Expected Buffer, got Buffer" — a pnpm dual-package
// hazard (two resolved `buffer` package instances: `buffer@5.7.1` and
// `buffer@6.0.3`) that only reproduces under jsdom, confirmed with a throwaway
// probe test in each project. The `contracts` project's plain Node environment
// resolves a single `buffer` instance, so the real call here is unaffected.
// `fundingInputCap.ts` is imported by relative path: the project has no `@/`
// alias, and the module pulls in no app setup. The SDK is imported from its
// `tbv/core/utils` subpath, which carries the fee, selection and funding
// helpers without pulling in the WASM module, so this test does not depend on
// the WASM package being built.

import {
  computeChangeOutputFeeSats,
  computeMaxDeposit,
  computePeginBaseFeeSats,
  DUST_THRESHOLD,
  fundPeginTransaction,
  peginOutputCount,
  selectUtxosForPegin,
  type UTXO,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import * as bitcoin from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { capFundingUtxos } from "../../services/deposit/fundingInputCap";

bitcoin.initEccLib(ecc);

const VALID_P2TR_SCRIPT =
  "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const OP_RETURN_SCRIPT = "6a20" + "00".repeat(32);
const NUM_OUTPUTS = peginOutputCount(1, true);
const FEE_RATE = 5;
const MAX_FUNDING_INPUT_COUNT = 20;
const ONE_BTC = 100_000_000;
const SCHNORR_SIGNATURE_BYTES = 64;
const NETWORK = bitcoin.networks.testnet;
const CHANGE_ADDRESS = bitcoin.address.fromOutputScript(
  Buffer.from(VALID_P2TR_SCRIPT, "hex"),
  NETWORK,
);

function makeUtxos(count: number, valueAt: (index: number) => number): UTXO[] {
  return Array.from({ length: count }, (_, index) => ({
    txid: (index + 1).toString(16).padStart(64, "0"),
    vout: 0,
    value: valueAt(index),
    scriptPubKey: VALID_P2TR_SCRIPT,
  }));
}

function unfundedPrePeginHex(outputValues: readonly bigint[]): string {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  outputValues.forEach((value, index) => {
    const scriptHex =
      index === outputValues.length - 1 ? OP_RETURN_SCRIPT : VALID_P2TR_SCRIPT;
    tx.addOutput(Buffer.from(scriptHex, "hex"), Number(value));
  });
  return tx.toHex();
}

function outpointsOf(utxos: readonly UTXO[]): string[] {
  return utxos.map((utxo) => `${utxo.txid}:${utxo.vout}`).sort();
}

function inputOutpointsOf(tx: bitcoin.Transaction): string[] {
  return tx.ins
    .map(
      (input) =>
        `${Buffer.from(input.hash).reverse().toString("hex")}:${input.index}`,
    )
    .sort();
}

describe("funding-input-cap estimator/selection agreement (real SDK)", () => {
  it("a Max deposit over the 20 largest of 25 UTXOs spends exactly those 20 and pays the 20-input base fee", () => {
    const capped = capFundingUtxos(
      makeUtxos(25, (index) => (index + 1) * 10_000),
      MAX_FUNDING_INPUT_COUNT,
    );
    expect(capped).toHaveLength(MAX_FUNDING_INPUT_COUNT);

    // Top 20 (60,000..250,000 sats) sum to 3,100,000; the cap drops 150,000.
    const maxDeposit = computeMaxDeposit({
      numInputs: capped.length,
      numOutputs: NUM_OUTPUTS,
      totalBalance: 3_100_000n,
      feeRate: FEE_RATE,
    });
    expect(maxDeposit).toBe(3_093_500n);

    const selection = selectUtxosForPegin(
      capped,
      maxDeposit as bigint,
      FEE_RATE,
      NUM_OUTPUTS,
    );
    expect(outpointsOf(selection.selectedUTXOs)).toEqual(outpointsOf(capped));
    expect(selection.fee).toBe(
      computePeginBaseFeeSats({
        numInputs: 20,
        numOutputs: NUM_OUTPUTS,
        feeRate: FEE_RATE,
      }),
    );
    expect(selection.fee).toBe(6500n);
    expect(selection.changeAmount).toBe(0n);
  });

  it("one sat above the capped Max is rejected as insufficient funds", () => {
    const capped = capFundingUtxos(
      makeUtxos(25, (index) => (index + 1) * 10_000),
      MAX_FUNDING_INPUT_COUNT,
    );

    expect(() =>
      selectUtxosForPegin(capped, 3_093_501n, FEE_RATE, NUM_OUTPUTS),
    ).toThrow(/Insufficient funds/);
  });

  it("a Max deposit over twenty 1 BTC UTXOs funds a Pre-PegIn with exactly 20 inputs, 3 outputs and no change", () => {
    const capped = capFundingUtxos(
      makeUtxos(20, () => ONE_BTC),
      MAX_FUNDING_INPUT_COUNT,
    );

    const maxDeposit = computeMaxDeposit({
      numInputs: capped.length,
      numOutputs: NUM_OUTPUTS,
      totalBalance: 20n * BigInt(ONE_BTC),
      feeRate: FEE_RATE,
    });
    expect(maxDeposit).toBe(1_999_993_500n);

    const selection = selectUtxosForPegin(
      capped,
      maxDeposit as bigint,
      FEE_RATE,
      NUM_OUTPUTS,
    );
    expect(selection.selectedUTXOs).toHaveLength(20);
    expect(selection.fee).toBe(6500n);
    expect(selection.changeAmount).toBe(0n);

    const fundedHex = fundPeginTransaction({
      unfundedTxHex: unfundedPrePeginHex([
        (maxDeposit as bigint) - DUST_THRESHOLD,
        DUST_THRESHOLD,
        0n,
      ]),
      selectedUTXOs: selection.selectedUTXOs,
      changeAddress: CHANGE_ADDRESS,
      changeAmount: selection.changeAmount,
      network: NETWORK,
    });
    const tx = bitcoin.Transaction.fromHex(fundedHex);

    expect(tx.ins).toHaveLength(20);
    expect(inputOutpointsOf(tx)).toEqual(outpointsOf(capped));
    expect(tx.outs).toHaveLength(NUM_OUTPUTS);

    const totalIn = 20n * BigInt(ONE_BTC);
    const totalOut = tx.outs.reduce((sum, out) => sum + BigInt(out.value), 0n);
    expect(totalIn - totalOut).toBe(selection.fee);

    tx.ins.forEach((_, index) =>
      tx.setWitness(index, [Buffer.alloc(SCHNORR_SIGNATURE_BYTES)]),
    );
    expect(selection.fee).toBeGreaterThanOrEqual(
      BigInt(tx.virtualSize() * FEE_RATE),
    );
  });

  it("a 1 BTC deposit from twenty 1 BTC UTXOs spends 2 inputs and returns the remainder as change", () => {
    const capped = capFundingUtxos(
      makeUtxos(20, () => ONE_BTC),
      MAX_FUNDING_INPUT_COUNT,
    );

    const selection = selectUtxosForPegin(
      capped,
      BigInt(ONE_BTC),
      FEE_RATE,
      NUM_OUTPUTS,
    );
    expect(selection.selectedUTXOs).toHaveLength(2);
    expect(selection.fee).toBe(
      computePeginBaseFeeSats({
        numInputs: 2,
        numOutputs: NUM_OUTPUTS,
        feeRate: FEE_RATE,
      }) + computeChangeOutputFeeSats(FEE_RATE),
    );
    expect(selection.fee).toBe(1495n);
    expect(selection.changeAmount).toBe(99_998_505n);

    const fundedHex = fundPeginTransaction({
      unfundedTxHex: unfundedPrePeginHex([
        BigInt(ONE_BTC) - DUST_THRESHOLD,
        DUST_THRESHOLD,
        0n,
      ]),
      selectedUTXOs: selection.selectedUTXOs,
      changeAddress: CHANGE_ADDRESS,
      changeAmount: selection.changeAmount,
      network: NETWORK,
    });
    const tx = bitcoin.Transaction.fromHex(fundedHex);

    expect(tx.ins).toHaveLength(2);
    expect(tx.outs).toHaveLength(NUM_OUTPUTS + 1);

    const changeOutput = tx.outs[tx.outs.length - 1];
    expect(changeOutput.value).toBe(99_998_505);
    expect(changeOutput.script).toEqual(
      bitcoin.address.toOutputScript(CHANGE_ADDRESS, NETWORK),
    );

    const totalOut = tx.outs.reduce((sum, out) => sum + BigInt(out.value), 0n);
    expect(2n * BigInt(ONE_BTC) - totalOut).toBe(selection.fee);
  });

  it("twenty UTXOs totalling 1 BTC cannot fund a 1 BTC deposit because the 20-input fee caps the Max at 0.999935 BTC", () => {
    const capped = capFundingUtxos(
      makeUtxos(20, () => 5_000_000),
      MAX_FUNDING_INPUT_COUNT,
    );

    const maxDeposit = computeMaxDeposit({
      numInputs: capped.length,
      numOutputs: NUM_OUTPUTS,
      totalBalance: BigInt(ONE_BTC),
      feeRate: FEE_RATE,
    });
    expect(maxDeposit).toBe(99_993_500n);

    expect(() =>
      selectUtxosForPegin(capped, BigInt(ONE_BTC), FEE_RATE, NUM_OUTPUTS),
    ).toThrow("need 100006500 sats");

    const selection = selectUtxosForPegin(
      capped,
      maxDeposit as bigint,
      FEE_RATE,
      NUM_OUTPUTS,
    );
    expect(selection.selectedUTXOs).toHaveLength(20);
    expect(selection.fee).toBe(6500n);
    expect(selection.changeAmount).toBe(0n);
  });
});
