/**
 * Tests for readRefundPrePeginContext — the refund context for an existing
 * vault, read at the vault's frozen RFC-006 key epochs.
 *
 * Every participant in this fixture rotated its operation key before the
 * vault registered, so the vault's frozen epochs point at the rotated keys
 * while the rosters still list the registration keys. That is the case this
 * module exists for: a refund built from the roster keys is refused, and one
 * built from the frozen-epoch keys spends the funded HTLC.
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Address, Hex } from "viem";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type {
  OnChainBtcPubkey,
  VersionedOffchainParams,
} from "../../../clients/eth/types";
import { buildPrePeginPsbt } from "../../../primitives/psbt/pegin";
import {
  generateXOnlyKeys,
  initializeWasmForTests,
} from "../../../primitives/psbt/__tests__/helpers";
import { fundPeginTransaction } from "../../../utils/transaction/fundPeginTransaction";
import {
  buildAndBroadcastRefund,
  type RefundPrePeginContext,
  type VaultRefundData,
} from "../buildAndBroadcastRefund";
import { readRefundPrePeginContext } from "../readRefundPrePeginContext";

// Distinct x-only keys per role, from scalars 100 and up so they stay clear of
// the shared TEST_KEYS. Each participant's registration key differs from the
// operation key at the vault's frozen epoch: all of them rotated before the
// vault registered.
const [DEPOSITOR] = generateXOnlyKeys(1, 100);
const [VP_REGISTRATION] = generateXOnlyKeys(1, 101);
const [VP_OPERATION] = generateXOnlyKeys(1, 102);
const KEEPERS_REGISTRATION = generateXOnlyKeys(3, 110);
const KEEPERS_OPERATION = generateXOnlyKeys(3, 120);
const CHALLENGERS_REGISTRATION = generateXOnlyKeys(2, 130);
const CHALLENGERS_OPERATION = generateXOnlyKeys(2, 140);

const KEEPER_ADDRESSES: Address[] = [
  "0x0000000000000000000000000000000000000011",
  "0x0000000000000000000000000000000000000012",
  "0x0000000000000000000000000000000000000013",
];
const CHALLENGER_ADDRESSES: Address[] = [
  "0x0000000000000000000000000000000000000021",
  "0x0000000000000000000000000000000000000022",
];
const KEEPER_ROSTER = KEEPERS_REGISTRATION.map((key, i) => ({
  ethAddress: KEEPER_ADDRESSES[i],
  btcPubKey: `0x${key}` as Hex,
}));
const CHALLENGER_ROSTER = CHALLENGERS_REGISTRATION.map((key, i) => ({
  ethAddress: CHALLENGER_ADDRESSES[i],
  btcPubKey: `0x${key}` as Hex,
}));

const VAULT_ID = `0x${"ab".repeat(32)}` as Hex;
const APP = "0xaaaa000000000000000000000000000000000001" as Address;
const VP_ADDRESS = "0xbbbb000000000000000000000000000000000002" as Address;
const EPOCHS = { vpKeyEpoch: 6n, appKeeperKeyEpoch: 6n, ucKeyEpoch: 7n };
const KEEPERS_VERSION = 2;
const CHALLENGERS_VERSION = 3;
const OFFCHAIN_PARAMS_VERSION = 4;
const VAULT_CORE_VERSION = 1;
const HASHLOCK = "12".repeat(32);
const AUTH_ANCHOR_HASH = "34".repeat(32);
const PEGIN_AMOUNT = 100_000n;
const NETWORK: Network = "signet";
/** sat/vB for the refund transaction itself, not a protocol param. */
const REFUND_FEE_RATE = 2;

const OFFCHAIN_PARAMS: VersionedOffchainParams = {
  timelockAssert: 432n,
  timelockChallengeAssert: 108n,
  securityCouncilKeys: [
    `0x${"01".repeat(32)}`,
    `0x${"02".repeat(32)}`,
    `0x${"03".repeat(32)}`,
  ],
  councilQuorum: 2,
  feeRate: 10n,
  babeTotalInstances: 1,
  babeInstancesToFinalize: 1,
  maxVpCommissionBps: 100,
  tRefund: 144,
  tStale: 288,
  minPeginFeeRate: 10n,
  proverCircuitVersion: 1,
  minPrepeginDepth: 1,
};

function readers() {
  return {
    registryReader: {
      getVaultProviderGenesisBtcPubKey: vi
        .fn()
        .mockResolvedValue(VP_REGISTRATION as OnChainBtcPubkey),
      getVaultKeyEpochs: vi.fn().mockResolvedValue(EPOCHS),
    },
    vaultKeeperReader: {
      getVaultKeepersByVersion: vi.fn().mockResolvedValue(KEEPER_ROSTER),
    },
    universalChallengerReader: {
      getUniversalChallengersByVersion: vi
        .fn()
        .mockResolvedValue(CHALLENGER_ROSTER),
    },
    operationKeyReader: {
      // In roster order, which is not sorted: the context must sort them.
      getOperationKeysAtEpochs: vi.fn().mockResolvedValue({
        vaultProvider: `0x${VP_OPERATION}`,
        vaultKeepers: [...KEEPERS_OPERATION].reverse().map((key) => `0x${key}`),
        universalChallengers: [...CHALLENGERS_OPERATION]
          .reverse()
          .map((key) => `0x${key}`),
      }),
    },
    protocolParamsReader: {
      getOffchainParamsByVersion: vi.fn().mockResolvedValue(OFFCHAIN_PARAMS),
    },
  };
}

function vaultRecord(fundedPrePeginTxHex: string): VaultRefundData {
  return {
    vaultCoreVersion: VAULT_CORE_VERSION,
    hashlock: `0x${HASHLOCK}`,
    htlcVout: 0,
    offchainParamsVersion: OFFCHAIN_PARAMS_VERSION,
    appVaultKeepersVersion: KEEPERS_VERSION,
    universalChallengersVersion: CHALLENGERS_VERSION,
    vaultProvider: VP_ADDRESS,
    applicationEntryPoint: APP,
    amount: PEGIN_AMOUNT,
    unsignedPrePeginTxHex: fundedPrePeginTxHex,
    depositorBtcPubkey: DEPOSITOR,
    batch: [{ hashlock: `0x${HASHLOCK}`, amount: PEGIN_AMOUNT, htlcVout: 0 }],
  };
}

/** A funded Pre-PegIn whose HTLC commits to the participants' operation keys. */
async function fundPrePeginUnderOperationKeys(): Promise<string> {
  const prePegin = await buildPrePeginPsbt({
    vaultCoreVersion: VAULT_CORE_VERSION,
    depositorPubkey: DEPOSITOR,
    vaultProviderPubkey: VP_OPERATION,
    vaultKeeperPubkeys: KEEPERS_OPERATION,
    universalChallengerPubkeys: CHALLENGERS_OPERATION,
    hashlocks: [HASHLOCK],
    timelockRefund: OFFCHAIN_PARAMS.tRefund,
    pegInAmounts: [PEGIN_AMOUNT],
    feeRate: OFFCHAIN_PARAMS.feeRate,
    minPeginFeeRate: OFFCHAIN_PARAMS.minPeginFeeRate,
    numLocalChallengers: KEEPERS_OPERATION.length,
    councilQuorum: OFFCHAIN_PARAMS.councilQuorum,
    councilSize: OFFCHAIN_PARAMS.securityCouncilKeys.length,
    network: NETWORK,
    authAnchorHash: AUTH_ANCHOR_HASH,
  });

  return fundPeginTransaction({
    unfundedTxHex: prePegin.psbtHex,
    selectedUTXOs: [
      {
        txid: "aa".repeat(32),
        vout: 0,
        value: Number(prePegin.totalOutputValue + 10_000n),
        scriptPubKey: "0014" + "bb".repeat(20),
      },
    ],
    changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
    changeAmount: 10_000n,
    network: bitcoin.networks.testnet,
  });
}

describe("readRefundPrePeginContext", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  it("resolves the participant keys at the vault's frozen epochs and reads the params at its offchainParamsVersion", async () => {
    const r = readers();

    const context = await readRefundPrePeginContext({
      vaultId: VAULT_ID,
      // The context reader never reads the transaction bytes.
      vault: vaultRecord("00"),
      readers: r,
      network: NETWORK,
    });

    expect(context).toEqual({
      vaultProviderPubkey: VP_OPERATION,
      vaultKeeperPubkeys: KEEPERS_OPERATION,
      universalChallengerPubkeys: CHALLENGERS_OPERATION,
      timelockRefund: 144,
      feeRate: 10n,
      minPeginFeeRate: 10n,
      numLocalChallengers: 3,
      councilQuorum: 2,
      councilSize: 3,
      network: "signet",
    });
    expect(r.registryReader.getVaultKeyEpochs).toHaveBeenCalledWith(VAULT_ID);
    expect(r.operationKeyReader.getOperationKeysAtEpochs).toHaveBeenCalledWith(
      {
        vaultProviderEthAddress: VP_ADDRESS,
        vaultProviderGenesisBtcPubkey: `0x${VP_REGISTRATION}`,
        applicationEntryPoint: APP,
        vaultKeepers: KEEPER_ROSTER,
        universalChallengers: CHALLENGER_ROSTER,
      },
      EPOCHS,
    );
    expect(r.vaultKeeperReader.getVaultKeepersByVersion).toHaveBeenCalledWith(
      APP,
      KEEPERS_VERSION,
    );
    expect(
      r.universalChallengerReader.getUniversalChallengersByVersion,
    ).toHaveBeenCalledWith(CHALLENGERS_VERSION);
    expect(
      r.protocolParamsReader.getOffchainParamsByVersion,
    ).toHaveBeenCalledWith(OFFCHAIN_PARAMS_VERSION);
  });

  it("builds a refund that spends the funded HTLC of a vault registered after its participants rotated", async () => {
    const vault = vaultRecord(await fundPrePeginUnderOperationKeys());
    const r = readers();
    const stopBeforeSigning = new Error("stop before the wallet signs");
    const signPsbt = vi.fn().mockRejectedValue(stopBeforeSigning);
    const broadcastTx = vi.fn();

    await expect(
      buildAndBroadcastRefund({
        vaultId: VAULT_ID,
        readVault: async () => vault,
        readPrePeginContext: (v) =>
          readRefundPrePeginContext({
            vaultId: VAULT_ID,
            vault: v,
            readers: r,
            network: NETWORK,
          }),
        feeRate: REFUND_FEE_RATE,
        signPsbt,
        broadcastTx,
      }),
    ).rejects.toBe(stopBeforeSigning);

    // The refund PSBT is only emitted once its rebuilt HTLC matches the funded
    // output, so reaching the wallet is the success; check it spends that output.
    const fundedHtlcScript = bitcoin.Transaction.fromHex(
      vault.unsignedPrePeginTxHex,
    ).outs[0].script;
    const psbt = bitcoin.Psbt.fromHex(signPsbt.mock.calls[0][0]);
    expect(
      Buffer.from(psbt.data.inputs[0].witnessUtxo?.script ?? []).toString(
        "hex",
      ),
    ).toBe(Buffer.from(fundedHtlcScript).toString("hex"));
    expect(broadcastTx).not.toHaveBeenCalled();
  });

  it("refuses a refund rebuilt from roster and indexer keys, pointing at the frozen epochs", async () => {
    const vault = vaultRecord(await fundPrePeginUnderOperationKeys());
    // What a hand-written context reading the rosters and the indexer's
    // vault-provider key produces for a vault registered after its
    // participants had rotated.
    const rosterContext: RefundPrePeginContext = {
      vaultProviderPubkey: VP_REGISTRATION,
      vaultKeeperPubkeys: KEEPERS_REGISTRATION,
      universalChallengerPubkeys: CHALLENGERS_REGISTRATION,
      timelockRefund: OFFCHAIN_PARAMS.tRefund,
      feeRate: OFFCHAIN_PARAMS.feeRate,
      minPeginFeeRate: OFFCHAIN_PARAMS.minPeginFeeRate,
      numLocalChallengers: KEEPERS_REGISTRATION.length,
      councilQuorum: OFFCHAIN_PARAMS.councilQuorum,
      councilSize: OFFCHAIN_PARAMS.securityCouncilKeys.length,
      network: NETWORK,
    };
    const signPsbt = vi.fn();

    await expect(
      buildAndBroadcastRefund({
        vaultId: VAULT_ID,
        readVault: async () => vault,
        readPrePeginContext: async () => rosterContext,
        feeRate: REFUND_FEE_RATE,
        signPsbt,
        broadcastTx: vi.fn(),
      }),
    ).rejects.toThrow(/HTLC scriptPubKey mismatch at vout 0[\s\S]*frozen epochs/);
    expect(signPsbt).not.toHaveBeenCalled();
  });
});
