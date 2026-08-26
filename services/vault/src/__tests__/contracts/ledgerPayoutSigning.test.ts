// @vitest-environment node
// Ledger payout signing contract: the SDK's Payout PSBT + sign options
// (ts-sdk) meet the signer's expected-signature table. wallet-connector
// (signer, no ts-sdk) could host this cycle-free too; the vault is chosen as
// the composition root whose runtime graph already carries both halves, next
// to the LedgerVaultProvider the stubs below mirror. Cost: standalone package
// consumers never run it, and a vault-only CI run goes red for an SDK bug.
//
// The `contracts` project in services/vault/vitest.config.ts aliases ts-sdk
// and the signer to their src/, so a source regression fails this file without
// a rebuild; only the WASM package is consumed built. Run it with
// `pnpm --filter vault test:run` (`test` alone is vitest watch mode).

import {
  createPayoutConnector,
  getAssertPayoutScriptInfo,
  initWasm,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import {
  prepareSignPsbt,
  type ExpectedSignatureTable,
} from "@babylonlabs-io/ledger-vault-signer";
import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "@babylonlabs-io/ts-sdk/shared";
import {
  PayoutManager,
  type SignPayoutParams,
} from "@babylonlabs-io/ts-sdk/tbv/core/managers";
import { deriveBip86ScriptPubKeyHex } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, payments, Transaction } from "bitcoinjs-lib";
import {
  rootHashFromPath,
  tapleafHash,
} from "bitcoinjs-lib/src/payments/bip341";
import { Buffer } from "buffer";
import { beforeAll, describe, expect, it } from "vitest";

// Deterministic x-only keys (scalar * G), the same set the SDK's PSBT tests use.
const DEPOSITOR =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const VAULT_PROVIDER =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const VAULT_KEEPER =
  "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";
const UNIVERSAL_CHALLENGER =
  "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4";

const VAULT_CORE_VERSION = 1;
const TIMELOCK_PEGIN = 100;
const TIMELOCK_ASSERT = 144;
const COUNCIL_QUORUM = 2;
const COMMISSION_BPS = 500;
const PROTOCOL_FEE_RATE = 10n;

const PEGIN_VALUE_SATS = 100_000;
const ASSERT_VALUE_SATS = 50_000;
const VP_COMMISSION_SATS = 1_000;
const CPFP_ANCHOR_SATS = 546;
// Fee band for this shape (assertPayoutFeeBand.ts:141-148,160): floor 4,080
// (WASM computePayoutFeeFloor, out1Len 22) <= 5,000 <= 10 x (500 + 55 x 2) = 6,100.
const PAYOUT_FEE_SATS = 5_000;
const DEPOSITOR_PAYOUT_SATS =
  PEGIN_VALUE_SATS +
  ASSERT_VALUE_SATS -
  PAYOUT_FEE_SATS -
  VP_COMMISSION_SATS -
  CPFP_ANCHOR_SATS;

const PAYOUT_TX_VERSION = 2;
const SEQUENCE_MAX = 0xffffffff;
const TAPSCRIPT_LEAF_VERSION = 0xc0;

// P2WPKH: OP_0 PUSH_20 <hash>; the fill byte only makes the outputs distinct.
function dummyP2wpkh(fillNibble: string): Buffer {
  return Buffer.from(`0014${fillNibble.repeat(40)}`, "hex");
}

/** Sorted x-only keys for scalars offset..offset+count-1 — a valid council. */
function councilKeys(count: number, offset: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const scalar = Buffer.alloc(32);
    scalar.writeUInt32BE(offset + i, 28);
    const point = ecc.pointFromScalar(scalar, true);
    if (!point) throw new Error(`invalid scalar ${offset + i}`);
    keys.push(Buffer.from(point.subarray(1, 33)).toString("hex"));
  }
  return keys.sort();
}

// BIP-341 fold of (leaf, control block) to the P2TR output it spends. A second
// implementation on purpose: buildPayoutPsbt binds the leaf with the SDK's own
// computeTaprootScriptPubKey (primitives/utils/taproot.ts:103), so the oracle is
// bitcoinjs' bip341 deep import (precedent: signer tapLeafHash.test.ts:8).
function taprootOutputFor(scriptHex: string, controlBlockHex: string): Buffer {
  const controlBlock = Buffer.from(controlBlockHex, "hex");
  const leafHash = tapleafHash({
    output: Buffer.from(scriptHex, "hex"),
    version: TAPSCRIPT_LEAF_VERSION,
  });
  const output = payments.p2tr({
    internalPubkey: controlBlock.subarray(1, 33),
    hash: rootHashFromPath(controlBlock, leafHash),
  }).output;
  if (!output) throw new Error("p2tr produced no output script");
  return output;
}

const STOP_AFTER_PREPARE = new Error("stop: table captured");

// BitcoinWallet requires every method; the ones a test does not drive throw.
function notExercised(): never {
  throw new Error("not exercised by this test");
}

// Mirrors LedgerVaultProvider.stagePsbt: only the requested indices are honoured.
function captureTable(
  psbtHex: string,
  options: SignPsbtOptions | undefined,
  tables: ExpectedSignatureTable[],
): void {
  const signInputIndexes = options?.signInputs?.map((input) => input.index);
  const { table } = prepareSignPsbt({
    psbtHex,
    depositorXOnlyHex: DEPOSITOR,
    signInputIndexes,
  });
  tables.push(table);
}

/** signPsbt does what LedgerVaultProvider.signPsbt does up to the table, then bails so extraction never runs. */
function ledgerSequentialWallet(
  tables: ExpectedSignatureTable[],
): BitcoinWallet {
  return {
    getPublicKeyHex: async () => DEPOSITOR,
    signPsbt: async (psbtHex, options) => {
      captureTable(psbtHex, options, tables);
      throw STOP_AFTER_PREPARE;
    },
    signPsbts: notExercised,
    getAddress: notExercised,
    signMessage: notExercised,
    getNetwork: notExercised,
    deriveContextHash: notExercised,
  };
}

/** signPsbts mirrors only LedgerVaultProvider.signPsbts' index -> options[k] mapping (not its intra-batch duplicate guard), then bails. */
function ledgerBatchWallet(tables: ExpectedSignatureTable[]): BitcoinWallet {
  return {
    getPublicKeyHex: async () => DEPOSITOR,
    signPsbt: notExercised,
    signPsbts: async (psbtsHexes, options) => {
      for (const [index, hex] of psbtsHexes.entries()) {
        captureTable(hex, options?.[index], tables);
      }
      throw STOP_AFTER_PREPARE;
    },
    getAddress: notExercised,
    signMessage: notExercised,
    getNetwork: notExercised,
    deriveContextHash: notExercised,
  };
}

describe("Ledger payout signing contract", () => {
  let params: SignPayoutParams;

  beforeAll(async () => {
    initEccLib(ecc);
    await initWasm();

    const councilMembers = councilKeys(3, 9_000);

    // PegIn:0 is the real vault output for these participants.
    const vaultOutput = await createPayoutConnector(
      {
        txGraphVersion: VAULT_CORE_VERSION,
        depositor: DEPOSITOR,
        vaultProvider: VAULT_PROVIDER,
        vaultKeepers: [VAULT_KEEPER],
        universalChallengers: [UNIVERSAL_CHALLENGER],
        timelockPegin: TIMELOCK_PEGIN,
      },
      "signet",
    );
    const peginTx = new Transaction();
    peginTx.addInput(Buffer.alloc(32, 0), 0xffffffff, SEQUENCE_MAX);
    peginTx.addOutput(
      Buffer.from(vaultOutput.scriptPubKey, "hex"),
      PEGIN_VALUE_SATS,
    );

    // Assert:0 is the taptree the VP-claimer payout leaf lives in. Local
    // challengers for a VP claimer are ({VP} ∪ VKs) − {VP} (btc-vault graph.rs).
    const assertLeaf = await getAssertPayoutScriptInfo({
      txGraphVersion: VAULT_CORE_VERSION,
      claimer: VAULT_PROVIDER,
      localChallengers: [VAULT_KEEPER],
      universalChallengers: [UNIVERSAL_CHALLENGER],
      timelockAssert: TIMELOCK_ASSERT,
      councilMembers,
      councilQuorum: COUNCIL_QUORUM,
    });
    const assertTx = new Transaction();
    assertTx.addInput(Buffer.alloc(32, 2), 0xffffffff, SEQUENCE_MAX);
    assertTx.addOutput(
      taprootOutputFor(assertLeaf.payoutScript, assertLeaf.payoutControlBlock),
      ASSERT_VALUE_SATS,
    );

    // The VP-claimer Payout shape buildPayoutPsbt validates: depositor payout,
    // VP commission, CPFP anchor; input sequences carry the CSV timelocks.
    const payoutTx = new Transaction();
    payoutTx.version = PAYOUT_TX_VERSION;
    payoutTx.addInput(
      Buffer.from(peginTx.getId(), "hex").reverse(),
      0,
      TIMELOCK_PEGIN,
    );
    payoutTx.addInput(
      Buffer.from(assertTx.getId(), "hex").reverse(),
      0,
      TIMELOCK_ASSERT,
    );
    payoutTx.addOutput(dummyP2wpkh("a"), DEPOSITOR_PAYOUT_SATS);
    payoutTx.addOutput(dummyP2wpkh("e"), VP_COMMISSION_SATS);
    payoutTx.addOutput(dummyP2wpkh("c"), CPFP_ANCHOR_SATS);

    params = {
      vaultCoreVersion: VAULT_CORE_VERSION,
      payoutTxHex: payoutTx.toHex(),
      peginTxHex: peginTx.toHex(),
      assertTxHex: assertTx.toHex(),
      depositorBtcPubkey: DEPOSITOR,
      vaultProviderBtcPubkey: VAULT_PROVIDER,
      vaultKeeperBtcPubkeys: [VAULT_KEEPER],
      universalChallengerBtcPubkeys: [UNIVERSAL_CHALLENGER],
      timelockPegin: TIMELOCK_PEGIN,
      timelockAssert: TIMELOCK_ASSERT,
      claimerBtcPubkey: VAULT_PROVIDER,
      registeredPayoutScriptPubKey: dummyP2wpkh("a").toString("hex"),
      commissionBps: COMMISSION_BPS,
      protocolFeeRate: PROTOCOL_FEE_RATE,
      councilMembers,
      councilQuorum: COUNCIL_QUORUM,
      vkClaimerPayoutScriptPubKeys: {
        [VAULT_KEEPER]: deriveBip86ScriptPubKeyHex(VAULT_KEEPER),
      },
      vpCommissionScriptPubKey: dummyP2wpkh("e").toString("hex"),
    };
  });

  it("PayoutManager asks the Ledger signer for input 0 alone on a real Payout PSBT", async () => {
    const tables: ExpectedSignatureTable[] = [];
    const manager = new PayoutManager({
      network: "signet",
      btcWallet: ledgerSequentialWallet(tables),
    });

    await expect(manager.signPayoutTransaction(params)).rejects.toBe(
      STOP_AFTER_PREPARE,
    );

    expect(tables).toHaveLength(1);
    expect([...tables[0].byInput.keys()]).toEqual([0]);
    expect(tables[0].expectedYieldCount).toBe(1);
  });

  it("the Ledger signer still classifies Payout input 1 as a tapscript input it must gate", async () => {
    const tables: ExpectedSignatureTable[] = [];
    const manager = new PayoutManager({
      network: "signet",
      btcWallet: ledgerSequentialWallet(tables),
    });

    await expect(manager.signPayoutTransaction(params)).rejects.toBe(
      STOP_AFTER_PREPARE,
    );

    expect(tables).toHaveLength(1);
    expect([...tables[0].classifiedByInput.keys()]).toEqual([0, 1]);
    for (const expectation of tables[0].classifiedByInput.values()) {
      expect(expectation.kind).toBe("tapscript");
    }
  });

  // The production presign path (runDepositorPresignFlow) takes this branch
  // whenever the wallet has signPsbts, which the Ledger provider does.
  it("PayoutManager's batch path asks the Ledger signer for input 0 alone on every real Payout PSBT", async () => {
    const tables: ExpectedSignatureTable[] = [];
    const manager = new PayoutManager({
      network: "signet",
      btcWallet: ledgerBatchWallet(tables),
    });

    // Two elements on purpose: element k must be staged with options[k].
    await expect(
      manager.signPayoutTransactionsBatch([params, params]),
    ).rejects.toBe(STOP_AFTER_PREPARE);

    expect(tables).toHaveLength(2);
    for (const table of tables) {
      expect([...table.byInput.keys()]).toEqual([0]);
      expect(table.expectedYieldCount).toBe(1);
      expect([...table.classifiedByInput.keys()]).toEqual([0, 1]);
      for (const expectation of table.classifiedByInput.values()) {
        expect(expectation.kind).toBe("tapscript");
      }
    }
  });
});
