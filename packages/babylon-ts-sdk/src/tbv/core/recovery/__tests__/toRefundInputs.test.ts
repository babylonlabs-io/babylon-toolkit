/**
 * Tests that recovery reaches the same refund the ordinary path would.
 *
 * The one that carries the weight is the byte-identity check: a refund PSBT
 * built from parameters recovered blind must equal, byte for byte, the PSBT
 * built from the parameters the deposit was actually made with. That is the
 * safety property the whole reconstruction exists to provide, and it can be
 * proven here — headless, against the real WASM engine — because
 * `buildRefundPsbt` takes parameters directly rather than reading a vault row.
 *
 * The plan for this work assumed that proof needed a wallet and a signet run.
 * It does not: no signing is involved in building the PSBT.
 */

import {
  computeMinClaimValue,
  computeMinPeginFee,
  getPrePeginHtlcConnectorInfo,
  peginP2aAnchorOutput,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeAll, describe, expect, it } from "vitest";

import {
  TEST_KEYS,
  initializeWasmForTests,
} from "../../primitives/psbt/__tests__/helpers";
import { buildRefundPsbt } from "../../primitives/psbt/refund";
import {
  buildPeginParamsCandidates,
  type OffchainParamsCandidate,
  type ParticipantKeySetCandidate,
} from "../peginParamsCandidates";
import { reconstructPeginParams } from "../reconstructPeginParams";
import { toRefundInputs } from "../toRefundInputs";

const NETWORK = "signet" as Network;
const VAULT_PROVIDER = "0x1111111111111111111111111111111111111111" as const;
const APP_ENTRY_POINT = "0x2222222222222222222222222222222222222222" as const;
const PREPEGIN_MAX_FEE = 1500n;
const COMMISSION_BPS = 250;
const REFUND_FEE = 800n;
const CORE_VERSION = 2;

const DEPOSITOR = TEST_KEYS.DEPOSITOR;
const VKS = [TEST_KEYS.VAULT_KEEPER_1, TEST_KEYS.VAULT_KEEPER_2];
const UCS = [TEST_KEYS.UNIVERSAL_CHALLENGER_1];

/** What the deposit was actually made with — the answer recovery must reach. */
const OFFCHAIN: OffchainParamsCandidate = {
  version: 4,
  protocolFeeRate: 3n,
  minPeginFeeRate: 7n,
  councilQuorum: 2,
  councilSize: 3,
  timelockPegin: 684,
  timelockAssert: 700,
  timelockRefund: 2016,
};

const PARTICIPANTS: ParticipantKeySetCandidate = {
  vaultProvider: VAULT_PROVIDER,
  vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
  appVaultKeepersVersion: 2,
  vaultKeeperBtcPubkeys: VKS,
  universalChallengersVersion: 5,
  universalChallengerBtcPubkeys: UCS,
};

const AUTH_ANCHOR_HASH = "cd".repeat(32);

interface Sibling {
  hashlock: string;
  amount: bigint;
}

async function buildFundedTx(siblings: Sibling[]): Promise<string> {
  const dcv = await computeMinClaimValue(
    CORE_VERSION,
    VKS.length,
    UCS.length,
    OFFCHAIN.councilQuorum,
    OFFCHAIN.councilSize,
    OFFCHAIN.protocolFeeRate,
  );
  const fee = await computeMinPeginFee(
    CORE_VERSION,
    VKS.length,
    UCS.length,
    OFFCHAIN.minPeginFeeRate,
  );
  const anchor = (await peginP2aAnchorOutput(CORE_VERSION))?.value ?? 0n;

  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0x11), 0);
  for (const sibling of siblings) {
    const info = await getPrePeginHtlcConnectorInfo({
      txGraphVersion: CORE_VERSION,
      depositorPubkey: DEPOSITOR,
      vaultProviderPubkey: PARTICIPANTS.vaultProviderBtcPubkey,
      vaultKeeperPubkeys: [...VKS],
      universalChallengerPubkeys: [...UCS],
      hashlock: sibling.hashlock,
      timelockRefund: OFFCHAIN.timelockRefund,
      network: NETWORK,
    });
    tx.addOutput(
      Buffer.from(info.scriptPubKey, "hex"),
      Number(sibling.amount + dcv + fee + anchor),
    );
  }
  tx.addOutput(
    Buffer.concat([
      Buffer.from([0x6a, 0x20]),
      Buffer.from(AUTH_ANCHOR_HASH, "hex"),
    ]),
    0,
  );
  return tx.toHex();
}

function recover(siblings: Sibling[], txHex: string) {
  return reconstructPeginParams({
    hashlocks: siblings.map((s) => s.hashlock),
    fundedPrePeginTxHex: txHex,
    depositorBtcPubkey: DEPOSITOR,
    prepeginMaxFee: PREPEGIN_MAX_FEE,
    maxAcceptableCommissionBps: COMMISSION_BPS,
    network: NETWORK,
    candidates: buildPeginParamsCandidates({
      vaultCoreVersion: CORE_VERSION,
      offchainParams: [OFFCHAIN],
      participantKeySets: [PARTICIPANTS],
    }),
    unresolvedVersions: [],
  });
}

describe("toRefundInputs", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  it("produces a refund PSBT byte-identical to the one the normal path builds", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_000_000n },
      { hashlock: "cd".repeat(32), amount: 2_500_000n },
    ];
    const txHex = await buildFundedTx(siblings);
    const htlcVout = 1;

    // The normal path: parameters known up front, straight from the deposit.
    const expected = await buildRefundPsbt({
      prePeginParams: {
        vaultCoreVersion: CORE_VERSION,
        depositorPubkey: DEPOSITOR,
        vaultProviderPubkey: PARTICIPANTS.vaultProviderBtcPubkey,
        vaultKeeperPubkeys: [...VKS],
        universalChallengerPubkeys: [...UCS],
        hashlocks: siblings.map((s) => s.hashlock),
        timelockRefund: OFFCHAIN.timelockRefund,
        pegInAmounts: siblings.map((s) => s.amount),
        feeRate: OFFCHAIN.protocolFeeRate,
        minPeginFeeRate: OFFCHAIN.minPeginFeeRate,
        numLocalChallengers: VKS.length,
        councilQuorum: OFFCHAIN.councilQuorum,
        councilSize: OFFCHAIN.councilSize,
        network: NETWORK,
        authAnchorHash: AUTH_ANCHOR_HASH,
      },
      fundedPrePeginTxHex: txHex,
      htlcVout,
      refundFee: REFUND_FEE,
      hashlock: siblings[htlcVout].hashlock,
    });

    // The recovery path: nothing known but the transaction and the hashlocks.
    const result = await recover(siblings, txHex);
    const { vault, context } = toRefundInputs(result, {
      htlcVout,
      depositorBtcPubkey: DEPOSITOR,
      applicationEntryPoint: APP_ENTRY_POINT,
      fundedPrePeginTxHex: txHex,
      hashlocks: siblings.map((s) => s.hashlock),
      network: NETWORK,
    });

    const actual = await buildRefundPsbt({
      prePeginParams: {
        vaultCoreVersion: vault.vaultCoreVersion,
        depositorPubkey: vault.depositorBtcPubkey,
        vaultProviderPubkey: context.vaultProviderPubkey,
        vaultKeeperPubkeys: [...context.vaultKeeperPubkeys],
        universalChallengerPubkeys: [...context.universalChallengerPubkeys],
        hashlocks: vault.batch.map((b) => b.hashlock.slice(2)),
        timelockRefund: context.timelockRefund,
        pegInAmounts: vault.batch.map((b) => b.amount),
        feeRate: context.feeRate,
        minPeginFeeRate: context.minPeginFeeRate,
        numLocalChallengers: context.numLocalChallengers,
        councilQuorum: context.councilQuorum,
        councilSize: context.councilSize,
        network: context.network,
        authAnchorHash: result.authAnchorHash,
      },
      fundedPrePeginTxHex: vault.unsignedPrePeginTxHex,
      htlcVout: vault.htlcVout,
      refundFee: REFUND_FEE,
      hashlock: vault.hashlock.slice(2),
    });

    expect(actual.psbtHex).toBe(expected.psbtHex);
  });

  // Mutation check on the assertion above: a byte comparison is only evidence
  // if it can fail. timelockRefund is the one recovered scalar that reaches the
  // HTLC script, so perturbing it must change the refund — otherwise the
  // identity test above would pass for any reconstruction at all.
  it("builds a different refund when a script-relevant parameter is perturbed", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_000_000n },
    ];
    const txHex = await buildFundedTx(siblings);
    const result = await recover(siblings, txHex);
    const { vault, context } = toRefundInputs(result, {
      htlcVout: 0,
      depositorBtcPubkey: DEPOSITOR,
      applicationEntryPoint: APP_ENTRY_POINT,
      fundedPrePeginTxHex: txHex,
      hashlocks: siblings.map((s) => s.hashlock),
      network: NETWORK,
    });

    const params = {
      vaultCoreVersion: vault.vaultCoreVersion,
      depositorPubkey: vault.depositorBtcPubkey,
      vaultProviderPubkey: context.vaultProviderPubkey,
      vaultKeeperPubkeys: [...context.vaultKeeperPubkeys],
      universalChallengerPubkeys: [...context.universalChallengerPubkeys],
      hashlocks: vault.batch.map((b) => b.hashlock.slice(2)),
      pegInAmounts: vault.batch.map((b) => b.amount),
      feeRate: context.feeRate,
      minPeginFeeRate: context.minPeginFeeRate,
      numLocalChallengers: context.numLocalChallengers,
      councilQuorum: context.councilQuorum,
      councilSize: context.councilSize,
      network: context.network,
      authAnchorHash: result.authAnchorHash,
    };
    const common = {
      fundedPrePeginTxHex: vault.unsignedPrePeginTxHex,
      htlcVout: vault.htlcVout,
      refundFee: REFUND_FEE,
      hashlock: vault.hashlock.slice(2),
    };

    const good = await buildRefundPsbt({
      ...common,
      prePeginParams: { ...params, timelockRefund: context.timelockRefund },
    });

    // A wrong timelock changes the taptree, so the template no longer matches
    // the funded output — the builder refuses rather than signing the wrong
    // script. Either outcome proves the comparison has teeth; assert the
    // stronger one.
    await expect(
      buildRefundPsbt({
        ...common,
        prePeginParams: {
          ...params,
          timelockRefund: context.timelockRefund + 1,
        },
      }),
    ).rejects.toThrow();

    expect(good.psbtHex).toBeTruthy();
  });

  it("carries the whole vout-ordered batch, which the refund path requires", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_000_000n },
      { hashlock: "cd".repeat(32), amount: 2_500_000n },
    ];
    const txHex = await buildFundedTx(siblings);

    const { vault } = toRefundInputs(await recover(siblings, txHex), {
      htlcVout: 0,
      depositorBtcPubkey: DEPOSITOR,
      applicationEntryPoint: APP_ENTRY_POINT,
      fundedPrePeginTxHex: txHex,
      hashlocks: siblings.map((s) => s.hashlock),
      network: NETWORK,
    });

    expect(vault.batch).toHaveLength(2);
    expect(vault.batch.map((b) => b.htlcVout)).toEqual([0, 1]);
    expect(vault.batch.map((b) => b.amount)).toEqual([1_000_000n, 2_500_000n]);
    expect(vault.batch.map((b) => b.hashlock)).toEqual([
      `0x${"ab".repeat(32)}`,
      `0x${"cd".repeat(32)}`,
    ]);
  });

  it("restates the target's own fields from the batch entry it points at", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_000_000n },
      { hashlock: "cd".repeat(32), amount: 2_500_000n },
    ];
    const txHex = await buildFundedTx(siblings);

    const { vault, context } = toRefundInputs(await recover(siblings, txHex), {
      htlcVout: 1,
      depositorBtcPubkey: DEPOSITOR,
      applicationEntryPoint: APP_ENTRY_POINT,
      fundedPrePeginTxHex: txHex,
      hashlocks: siblings.map((s) => s.hashlock),
      network: NETWORK,
    });

    expect(vault.hashlock).toBe(`0x${"cd".repeat(32)}`);
    expect(vault.amount).toBe(2_500_000n);
    expect(vault.htlcVout).toBe(1);
    expect(vault.offchainParamsVersion).toBe(OFFCHAIN.version);
    expect(vault.appVaultKeepersVersion).toBe(2);
    expect(vault.universalChallengersVersion).toBe(5);
    expect(vault.vaultProvider).toBe(VAULT_PROVIDER);
    expect(vault.applicationEntryPoint).toBe(APP_ENTRY_POINT);
    // Depositor-as-claimer: local challengers are the keepers, VP excluded.
    expect(context.numLocalChallengers).toBe(VKS.length);
    expect(context.timelockRefund).toBe(OFFCHAIN.timelockRefund);
  });

  it("refuses an htlcVout outside the reconstructed batch", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_000_000n },
    ];
    const txHex = await buildFundedTx(siblings);
    const result = await recover(siblings, txHex);

    expect(() =>
      toRefundInputs(result, {
        htlcVout: 1,
        depositorBtcPubkey: DEPOSITOR,
        applicationEntryPoint: APP_ENTRY_POINT,
        fundedPrePeginTxHex: txHex,
        hashlocks: siblings.map((s) => s.hashlock),
        network: NETWORK,
      }),
    ).toThrow(/outside the reconstructed batch/);
  });

  it("refuses a hashlock vector that does not match the reconstructed amounts", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_000_000n },
    ];
    const txHex = await buildFundedTx(siblings);
    const result = await recover(siblings, txHex);

    expect(() =>
      toRefundInputs(result, {
        htlcVout: 0,
        depositorBtcPubkey: DEPOSITOR,
        applicationEntryPoint: APP_ENTRY_POINT,
        fundedPrePeginTxHex: txHex,
        hashlocks: ["ab".repeat(32), "cd".repeat(32)],
        network: NETWORK,
      }),
    ).toThrow(/describe different transactions/);
  });
});
