/**
 * One consistent delegated-claim PSBT set that parses.
 *
 * The binding checks read outpoints and taproot metadata off the PSBTs, so
 * opaque stand-ins no longer work. This builds the smallest set that is
 * internally consistent: Assert spends Claim:0, both Payouts spend
 * PegIn:0 and Assert:0 with the registered payout layout, and every signing
 * input carries the single tapLeafScript the WASM builders emit.
 */
import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Hex } from "viem";

import { deriveP2trScript } from "../../../../clients/eth/payout-script";
import type { OnChainBtcPubkey } from "../../../../clients/eth/types";

export const CHALLENGER_A = "aa".repeat(32);
export const CHALLENGER_B = "bb".repeat(32);
export const VAULT_PROVIDER_PUBKEY = "02".concat("77".repeat(32));
export const DEPOSITOR_PUBKEY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
/** x-only form of {@link DEPOSITOR_PUBKEY}, as the registry records it. */
export const DEPOSITOR_XONLY_PUBKEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" as OnChainBtcPubkey;
export const SIGNER_ADDRESS =
  "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2";
export const OTHER_ADDRESS =
  "tb1pet7ep3czdu9k4wvdlz2fp5p8x2yp7t6ttyqg2c6cmh0lgeuu9lasvfnc28";
export const DEPOSITOR_ETH_ADDRESS =
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
// A Claim PSBT whose only input spends the PegIn below, and the vault id
// that PegIn txid derives with the depositor address above (unchanged from
// the original test: the vault-id binding depends on these exact bytes).
export const CLAIM_PSBT =
  "cHNidP8BADMCAAAAAf/u3cy7qpmId2ZVRDMiEQD/7t3Mu6qZiHdmVUQzIhEAAQAAAAD/////AAAAAAAAAAA=";
export const VAULT_ID =
  "0xf5c2a4e499a96ee2a2e32acf1f16b51d2958e7819a1d5048eccab864163806c3" as Hex;
export const OTHER_VAULT_CLAIM_PSBT =
  "cHNidP8BADMCAAAAAQARIjNEVWZ3iJmqu8zd7v8AESIzRFVmd4iZqrvM3e7/AAAAAAD/////AAAAAAAAAAA=";
/**
 * The depositor's BIP-86 key-path P2TR: what the registration path accepts as
 * a payout script, and what the Payout's CPFP anchor pays.
 */
const DEPOSITOR_BIP86_P2TR_SCRIPT = deriveP2trScript(
  DEPOSITOR_XONLY_PUBKEY,
).slice(2);
export const REGISTERED_PAYOUT_SCRIPT = DEPOSITOR_BIP86_P2TR_SCRIPT;
/** secp256k1's 2G: a valid key that is not the fixture's depositor. */
export const OTHER_XONLY_PUBKEY =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
export const OTHER_BIP86_P2TR_SCRIPT =
  deriveP2trScript(OTHER_XONLY_PUBKEY).slice(2);

const PAYOUT_ANCHOR_SATS = 546;
/** Leaves an implicit Payout fee of `VAULT_UTXO_SATS - PAYOUT_VALUE_SATS` sats. */
const PAYOUT_VALUE_SATS = 99_000;
/** Value of PegIn:0, the prevout of Payout input 0. */
export const VAULT_UTXO_SATS = 100_000;
/** CSV sequence the Payout's two inputs carry unless a test overrides them. */
export const TIMELOCK_PEGIN = 684;
export const TIMELOCK_ASSERT = 700;
const CONNECTOR_SATS = 1_000;
const LEAF_VERSION = 0xc0;
// PegIn txid in internal byte order, as CLAIM_PSBT spends it.
const PEGIN_HASH = Psbt.fromBase64(CLAIM_PSBT).txInputs[0].hash;

/** A 33-byte control block: leaf version|parity then a 32-byte internal key. */
function controlBlock(): Buffer {
  return Buffer.concat([
    Buffer.from([LEAF_VERSION]),
    Buffer.from("50".repeat(32), "hex"),
  ]);
}

function tapLeaf(script: Buffer) {
  return [{ leafVersion: LEAF_VERSION, script, controlBlock: controlBlock() }];
}

function witnessUtxo(value: number) {
  return { script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"), value };
}

/** `<key> OP_CHECKSIG` leaf. */
function leafScript(xOnlyKeyHex: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x20]),
    Buffer.from(xOnlyKeyHex, "hex"),
    Buffer.from([0xac]),
  ]);
}

export interface DelegatedClaimFixture {
  claimPsbt: string;
  assertPsbt: string;
  payoutClaimerPsbt: string;
  /** Depositor Payout as the WASM builder emits it: input 1 carries no leaf. */
  payoutDepositorPsbt: string;
  /** Same unsigned tx, output 0 pays somebody else. */
  payoutWrongDestinationPsbt: string;
  wronglyChallengedPsbts: Record<string, string[]>;
}

/** Payout fields the fee-and-timelock tests vary; everything else is fixed. */
export interface PayoutOverrides {
  peginInputSequence?: number;
  assertInputSequence?: number;
  payoutValueSats?: number;
  /** scriptPubKey of the CPFP anchor output, hex. */
  anchorScriptHex?: string;
}

/**
 * By default each signed input carries a distinct tag key, so tests can tell
 * the leaves apart. With `signedLeafKey` (x-only hex) every signed input
 * carries that one key and the Claim gains the prevout and the two outputs
 * it lacks (a sighash needs both), so the whole set can be signed and
 * verified for real.
 */
export function buildDelegatedClaimFixture(
  signedLeafKey?: string,
  payoutOverrides: PayoutOverrides = {},
): DelegatedClaimFixture {
  const peginSequence = payoutOverrides.peginInputSequence ?? TIMELOCK_PEGIN;
  const assertSequence = payoutOverrides.assertInputSequence ?? TIMELOCK_ASSERT;
  const payoutValue = payoutOverrides.payoutValueSats ?? PAYOUT_VALUE_SATS;
  const anchorScript =
    payoutOverrides.anchorScriptHex ?? DEPOSITOR_BIP86_P2TR_SCRIPT;
  const leafKey = (tag: string): string =>
    signedLeafKey === undefined ? tag.repeat(32) : signedLeafKey;

  const claim = Psbt.fromBase64(CLAIM_PSBT);
  if (signedLeafKey !== undefined) {
    claim.updateInput(0, {
      witnessUtxo: witnessUtxo(VAULT_UTXO_SATS),
      tapLeafScript: tapLeaf(leafScript(signedLeafKey)),
    });
    claim.addOutput({
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: CONNECTOR_SATS,
    });
    claim.addOutput({
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: PAYOUT_ANCHOR_SATS,
    });
  }
  const claimHash = Transaction.fromBuffer(
    claim.data.globalMap.unsignedTx.toBuffer(),
  ).getHash();

  const assert = new Psbt();
  assert.setVersion(2);
  assert.setLocktime(0);
  assert.addInput({
    hash: claimHash,
    index: 0,
    sequence: 0xffffffff,
    witnessUtxo: witnessUtxo(CONNECTOR_SATS),
    tapLeafScript: tapLeaf(leafScript(leafKey("11"))),
  });
  assert.addOutput({
    script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
    value: PAYOUT_ANCHOR_SATS,
  });
  const assertHash = Transaction.fromBuffer(
    assert.data.globalMap.unsignedTx.toBuffer(),
  ).getHash();

  function payout(
    destination: string,
    withInput1Leaf: boolean,
    withInput0Leaf: boolean,
  ): Psbt {
    const p = new Psbt();
    p.setVersion(2);
    p.setLocktime(0);
    p.addInput({
      hash: PEGIN_HASH,
      index: 0,
      sequence: peginSequence,
      witnessUtxo: witnessUtxo(VAULT_UTXO_SATS),
      ...(withInput0Leaf
        ? { tapLeafScript: tapLeaf(leafScript(leafKey("22"))) }
        : {}),
    });
    p.addInput({
      hash: assertHash,
      index: 0,
      sequence: assertSequence,
      witnessUtxo: witnessUtxo(PAYOUT_ANCHOR_SATS),
      ...(withInput1Leaf
        ? { tapLeafScript: tapLeaf(leafScript(leafKey("33"))) }
        : {}),
    });
    p.addOutput({
      script: Buffer.from(destination, "hex"),
      value: payoutValue,
    });
    // btc-vault pays the CPFP anchor to the claimer's BIP-86 key
    // (`transactions/payout.rs:151-153` @ ac4954e7); here that is the depositor.
    p.addOutput({
      script: Buffer.from(anchorScript, "hex"),
      value: PAYOUT_ANCHOR_SATS,
    });
    return p;
  }

  const wc = (tag: string): string => {
    const p = new Psbt();
    p.setVersion(2);
    p.setLocktime(0);
    p.addInput({
      hash: assertHash,
      index: 1,
      sequence: 0xffffffff,
      witnessUtxo: witnessUtxo(CONNECTOR_SATS),
      tapLeafScript: tapLeaf(leafScript(leafKey(tag))),
    });
    p.addOutput({
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: PAYOUT_ANCHOR_SATS,
    });
    return p.toBase64();
  };

  return {
    claimPsbt: claim.toBase64(),
    assertPsbt: assert.toBase64(),
    payoutClaimerPsbt: payout(REGISTERED_PAYOUT_SCRIPT, true, false).toBase64(),
    payoutDepositorPsbt: payout(
      REGISTERED_PAYOUT_SCRIPT,
      false,
      true,
    ).toBase64(),
    payoutWrongDestinationPsbt: payout(
      OTHER_BIP86_P2TR_SCRIPT,
      true,
      false,
    ).toBase64(),
    wronglyChallengedPsbts: {
      [CHALLENGER_A]: [wc("a0"), wc("a1")],
      [CHALLENGER_B]: [wc("b0")],
    },
  };
}
