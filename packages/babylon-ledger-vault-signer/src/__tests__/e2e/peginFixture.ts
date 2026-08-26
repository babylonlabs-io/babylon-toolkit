/**
 * Signable Pre-PegIn and PegIn fixtures for the Speculos e2e suite.
 *
 * The Pre-PegIn is built FIRST and its txid feeds both the intent
 * (`prepeginTxid`) and the PegIn input, because `_validate_prepegin` compares
 * SHA256d(unsigned tx) against the intent's `prepegin_txid`
 * (fw `sign_psbt_validate.c:529-537` @ 4decf822).
 *
 * The committed SIGN_PSBT vectors were generated from foreign seeds, so this
 * builder replicates the firmware's own signable test path byte-for-byte:
 * `tests/test_sign_psbt_validate.py` (`_build_pegin_psbt`:309 and the leaf
 * builders at :142-221) and `tests/vault_client.py` (test constants at
 * :99-127, `_vault_expand_commitment`:262) at the fw rev the container runs
 * (v0.9.5). Every constant below cites its source line.
 *
 * @module ledger-vault-signer/__tests__/e2e/peginFixture
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { crypto as bcrypto, initEccLib, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { createHash, createHmac } from "node:crypto";

import type { IntentScalars, IntentVaultGroup } from "../../intentTlv";
import { tapLeafHash } from "../../tapLeafHash";
import type { DepositTerms } from "../../types";

// `payments.p2tr` tweaks the internal key, which needs the ecc backend.
initEccLib(ecc);

/** BIP-341 tapscript leaf version — the only one the vault graph uses. */
const TAPSCRIPT_LEAF_VERSION = 0xc0;

// ---------------------------------------------------------------------------
// Firmware test constants (tests/test_sign_psbt_validate.py:105-135 and
// tests/vault_client.py:99-127). The depositor key is the device's own
// m/86'/1'/0'/0/0 for the shared firmware-test mnemonic — verified live
// against the running container via GET_EXTENDED_PUBKEY.
// ---------------------------------------------------------------------------

export const DEPOSITOR_XONLY_HEX = "dc8d2f9eff0c4f4dbde070a48e330efc908b62a766568d91e658f284b324b878";
/** TEST_VP_KEY (vault_client.py:99) — the secp256k1 generator's x. */
export const VP_KEY_HEX = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
/** TEST_VALID_KEYS[0] (vault_client.py:105). */
export const KEEPER_KEY_HEX = "25d1dff95105f5253c4022f628a996ad3a0d95fbf21d468a1b33f8c160d8f517";
/** TEST_VALID_KEYS[1] (vault_client.py:106). */
export const CHALLENGER_KEY_HEX = "2f01e5e15cca351daff3843fb70f3c2f0a1bdd05e5af888a67784ef3e10a2a01";
/** VAULT_NUMS_XONLY (test_sign_psbt_validate.py:63). */
const NUMS_XONLY_HEX = "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";

export const VAULT_AMOUNT_SATS = 9_876_543;
export const COMMISSION_FEE_SATS = 54_321;
export const DEPOSITOR_CLAIM_VALUE_SATS = 12_345;
export const BASE_FEE_RATE = 1;
export const PEGIN_MAX_FEE_SATS = 567_891;
export const PEGIN_CSV_TIMELOCK = 144;
export const PAYOUT_TIMELOCK = 200;
export const HTLC_REFUND_TIMELOCK = 144;
export const HTLC_VOUT = 0;
/** P2A anchor value — must match P2A_ANCHOR_VALUE in fw vault_constants.h. */
export const PEGIN_ANCHOR_VALUE_SATS = 240;
export const PREPEGIN_MAX_FEE_SATS = 500_000;

/**
 * htlc_value must land in [amount + claim + anchor, … + pegin_max_fee]
 * (test_sign_psbt_validate.py:117-119): the +234 567 fee term keeps it inside.
 */
export const HTLC_VALUE_SATS = VAULT_AMOUNT_SATS + DEPOSITOR_CLAIM_VALUE_SATS + PEGIN_ANCHOR_VALUE_SATS + 234_567;

/** Value of each Pre-PegIn funding input — two of them cover HTLC + anchor + change + fee. */
export const PREPEGIN_INPUT_VALUE_SATS = 20_000_000;
/** ≤ PREPEGIN_MAX_FEE_SATS, and far above 1 sat/vB for a ~254 vB transaction. */
const PREPEGIN_FEE_SATS = 50_000;
/** VAULT_DUST_LIMIT — the exact CPFP anchor value the device demands (fw vault_constants.h:64). */
const CPFP_ANCHOR_VALUE_SATS = 546;
/** Testnet BIP-32 version bytes — the signet build answers tpub/tprv. */
export const TESTNET_VERSIONS = { public: 0x043587cf, private: 0x04358394 };

/** _DERIVE_CONTEXT = bytes(range(72)) (test_sign_psbt_validate.py:591). */
export const DERIVE_CONTEXT = Uint8Array.from(Array.from({ length: 72 }, (_, i) => i));

/** DERIVE_CONTEXT_HASH app name (vault_client.py:258). */
export const VAULT_APP_NAME = "babylon-btc-vault";

const HARDENED = 0x80000000;
/**
 * m/86'/1'/0'/0/0 — depositor_path(coin_type=1) (vault_client.py:279). Levels
 * use `+` (unsigned, provider.ts:205-212): `|` yields negative int32s that
 * `assertBip86Path` rejects; the wire bytes are identical (`>>> 0` serializers).
 */
export const DEPOSITOR_PATH: readonly number[] = [86 + HARDENED, 1 + HARDENED, 0 + HARDENED, 0, 0];
const TESTNET_COIN_TYPE = 1;

/** P2A anchor scriptPubKey `51 02 4e 73` (test_sign_psbt_validate.py:349). */
const P2A_SCRIPT_PUB_KEY = Buffer.from([0x51, 0x02, 0x4e, 0x73]);

const hexToBuffer = (hex: string): Buffer => Buffer.from(hex, "hex");
const NUMS_XONLY = hexToBuffer(NUMS_XONLY_HEX);

// ---------------------------------------------------------------------------
// Script builders — TS replicas of the fw test's Python replicas of
// vault_script.c (test_sign_psbt_validate.py:142-221).
// ---------------------------------------------------------------------------

const OP_NUMEQUAL = 0x9c;
const OP_NUMEQUALVERIFY = 0x9d;
const OP_SIZE = 0x82;
const OP_EQUALVERIFY = 0x88;
const OP_SHA256 = 0xa8;
const OP_CHECKSIG = 0xac;
const OP_CHECKSIGVERIFY = 0xad;
const OP_CHECKSIGADD = 0xba;
const OP_CSV = 0xb2;
const PUSH_32 = 0x20;

/** Minimal script-number push (test_sign_psbt_validate.py:73). */
function encodeScriptNum(n: number): Buffer {
  if (n === 0) return Buffer.from([0x00]);
  if (n >= 1 && n <= 16) return Buffer.from([0x51 + n - 1]);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.push(v & 0xff);
    v >>= 8;
  }
  if ((bytes[bytes.length - 1] & 0x80) !== 0) bytes.push(0x00);
  return Buffer.from([bytes.length, ...bytes]);
}

/**
 * N-of-N multisig fragment. No single-key special case: `encode_multisig_group`
 * (fw `src/vault_script.c:204-231` @ e2d0c45b) emits the counted form for N>=1,
 * so a `<key> OP_CHECKSIG` shortcut would build a leaf 4 bytes short of the one
 * the device rebuilds and compares.
 */
function multisigGroup(keys: readonly Buffer[], isFinal: boolean): Buffer {
  const parts: Buffer[] = [Buffer.concat([Buffer.from([PUSH_32]), keys[0], Buffer.from([OP_CHECKSIG])])];
  for (const key of keys.slice(1)) {
    parts.push(Buffer.concat([Buffer.from([PUSH_32]), key, Buffer.from([OP_CHECKSIGADD])]));
  }
  parts.push(encodeScriptNum(keys.length));
  parts.push(Buffer.from([isFinal ? OP_NUMEQUAL : OP_NUMEQUALVERIFY]));
  return Buffer.concat(parts);
}

/** HTLC Leaf 0 — hashlock + all-parties leaf (test_sign_psbt_validate.py:154). */
function htlcLeaf0(
  depositorPk: Buffer,
  vpPk: Buffer,
  keeperPks: readonly Buffer[],
  challengerPks: readonly Buffer[],
  hashlock: Buffer,
): Buffer {
  return Buffer.concat([
    Buffer.from([OP_SIZE]),
    encodeScriptNum(32),
    Buffer.from([OP_EQUALVERIFY]),
    Buffer.from([OP_SHA256, PUSH_32]),
    hashlock,
    Buffer.from([OP_EQUALVERIFY]),
    Buffer.from([PUSH_32]),
    depositorPk,
    Buffer.from([OP_CHECKSIGVERIFY]),
    Buffer.from([PUSH_32]),
    vpPk,
    Buffer.from([OP_CHECKSIGVERIFY]),
    multisigGroup(keeperPks, false),
    multisigGroup(challengerPks, true),
  ]);
}

/** HTLC Leaf 1 — depositor refund with CSV (test_sign_psbt_validate.py:169). */
function htlcLeaf1(depositorPk: Buffer, refundTimelock: number): Buffer {
  return Buffer.concat([
    Buffer.from([PUSH_32]),
    depositorPk,
    Buffer.from([OP_CHECKSIGVERIFY]),
    encodeScriptNum(refundTimelock),
    Buffer.from([OP_CSV]),
  ]);
}

/** Vault UTXO leaf (test_sign_psbt_validate.py:175). */
function vaultUtxoLeaf(
  depositorPk: Buffer,
  vpPk: Buffer,
  keeperPks: readonly Buffer[],
  challengerPks: readonly Buffer[],
  peginCsvTimelock: number,
): Buffer {
  return Buffer.concat([
    Buffer.from([PUSH_32]),
    depositorPk,
    Buffer.from([OP_CHECKSIGVERIFY]),
    Buffer.from([PUSH_32]),
    vpPk,
    Buffer.from([OP_CHECKSIGVERIFY]),
    multisigGroup(keeperPks, false),
    multisigGroup(challengerPks, false),
    encodeScriptNum(peginCsvTimelock),
    Buffer.from([OP_CSV]),
  ]);
}

/** Depositor Claim leaf `<D> OP_CHECKSIG` (test_sign_psbt_validate.py:188). */
function depositorClaimLeaf(depositorPk: Buffer): Buffer {
  return Buffer.concat([Buffer.from([PUSH_32]), depositorPk, Buffer.from([OP_CHECKSIG])]);
}

// ---------------------------------------------------------------------------
// Taproot helpers (BIP-341; mirror test_utils.taproot as used by the fw test)
// ---------------------------------------------------------------------------

function tapBranch(a: Buffer, b: Buffer): Buffer {
  const [left, right] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  return bcrypto.taggedHash("TapBranch", Buffer.concat([left, right]));
}

function tweakNums(merkleRoot: Buffer): { parity: 0 | 1; xOnly: Buffer } {
  const tweak = bcrypto.taggedHash("TapTweak", Buffer.concat([NUMS_XONLY, merkleRoot]));
  const tweaked = ecc.xOnlyPointAddTweak(NUMS_XONLY, tweak);
  if (tweaked === null) {
    throw new Error("NUMS taptweak produced no point");
  }
  return { parity: tweaked.parity, xOnly: Buffer.from(tweaked.xOnlyPubkey) };
}

function p2trFromSingleLeaf(leaf: Buffer): Buffer {
  const { xOnly } = tweakNums(tapLeafHash(TAPSCRIPT_LEAF_VERSION, leaf));
  return Buffer.concat([Buffer.from([0x51, PUSH_32]), xOnly]);
}

// ---------------------------------------------------------------------------
// Hashlock from the device-returned root — host-side mirror of fw
// derive_vault_secrets_core.h (vault_client.py:262-271):
// h = SHA256(HKDF-Expand-SHA256(root, "babylonbtcvault" ‖ len ‖ label ‖
//     u16be(len(ctx)) ‖ ctx, 32)), single block.
// ---------------------------------------------------------------------------

const VAULT_SECRETS_DOMAIN_TAG = "babylonbtcvault";
const HKDF_SINGLE_BLOCK_COUNTER = 0x01;

function vaultExpandCommitment(root: Buffer, label: string, ctx: Buffer): Buffer {
  const labelBytes = Buffer.from(label, "ascii");
  const ctxLen = Buffer.alloc(2);
  ctxLen.writeUInt16BE(ctx.length);
  const info = Buffer.concat([
    Buffer.from(VAULT_SECRETS_DOMAIN_TAG, "ascii"),
    Buffer.from([labelBytes.length]),
    labelBytes,
    ctxLen,
    ctx,
  ]);
  const secret = createHmac("sha256", root)
    .update(Buffer.concat([info, Buffer.from([HKDF_SINGLE_BLOCK_COUNTER])]))
    .digest();
  return createHash("sha256").update(secret).digest();
}

/** On-chain HTLC hashlock h for one vault (vault_client.py:269). */
export function vaultHashlock(root: Uint8Array, htlcVout: number): Buffer {
  const ctx = Buffer.alloc(4);
  ctx.writeUInt32BE(htlcVout);
  return vaultExpandCommitment(Buffer.from(root), "hashlock", ctx);
}

// ---------------------------------------------------------------------------
// Deposit terms + intent mapping
// ---------------------------------------------------------------------------

/**
 * The e2e deposit terms, bound to the Pre-PegIn the suite actually signs —
 * pass {@link PrePeginPsbtFixture.txidInternal}. `prepeginTxid` is DISPLAY
 * order: the seam converts display → internal exactly like wallet-connector's
 * provider, and the wire carries the internal-order bytes the firmware compares
 * against the PSBT. `vaultCoreVersion` is 2 — the graph version the fixture
 * PSBTs were built under; the TLV's structure/version constants (both 1) are
 * pinned inside the encoder.
 */
export function buildDepositTerms(prepeginTxidInternal: Buffer): DepositTerms {
  return {
    vaultCoreVersion: 2,
    protocolFeeRate: BigInt(BASE_FEE_RATE),
    timelockPegin: PEGIN_CSV_TIMELOCK,
    timelockAssert: PAYOUT_TIMELOCK,
    timelockRefund: HTLC_REFUND_TIMELOCK,
    prepeginTxid: Buffer.from(prepeginTxidInternal).reverse().toString("hex"),
    prepeginMaxFee: BigInt(PREPEGIN_MAX_FEE_SATS),
    vaultKeeperBtcPubkeys: [KEEPER_KEY_HEX],
    universalChallengerBtcPubkeys: [CHALLENGER_KEY_HEX],
    vaults: [
      {
        htlcVout: HTLC_VOUT,
        vaultProviderBtcPubkey: VP_KEY_HEX,
        peginAmount: BigInt(VAULT_AMOUNT_SATS),
        commissionFee: BigInt(COMMISSION_FEE_SATS),
        depositorClaimValue: BigInt(DEPOSITOR_CLAIM_VALUE_SATS),
        peginMaxFee: BigInt(PEGIN_MAX_FEE_SATS),
      },
    ],
  };
}

export interface IntentFixture {
  scalars: IntentScalars;
  groups: IntentVaultGroup[];
  keeperPubkeys: Uint8Array[];
  challengerPubkeys: Uint8Array[];
}

/**
 * DepositTerms → APPROVE_VAULT_INTENT inputs, mirroring wallet-connector's
 * `LedgerVaultProvider.approveDepositTerms` mapping (provider.ts:318-363),
 * including the display→internal txid flip.
 */
export function termsToIntent(terms: DepositTerms): IntentFixture {
  return {
    scalars: {
      coinType: TESTNET_COIN_TYPE,
      baseFeeRate: terms.protocolFeeRate,
      peginCsvTimelock: terms.timelockPegin,
      payoutTimelock: terms.timelockAssert,
      prepeginTxidInternal: Uint8Array.from(Buffer.from(terms.prepeginTxid, "hex")).reverse(),
      htlcRefundTimelock: terms.timelockRefund,
      depositorPath: DEPOSITOR_PATH,
      keeperCount: terms.vaultKeeperBtcPubkeys.length,
      challengerCount: terms.universalChallengerBtcPubkeys.length,
      vaultCount: terms.vaults.length,
      prepeginMaxFee: terms.prepeginMaxFee,
    },
    groups: terms.vaults.map((vault) => ({
      htlcVout: vault.htlcVout,
      vaultProviderPubkey: Uint8Array.from(hexToBuffer(vault.vaultProviderBtcPubkey)),
      vaultAmount: vault.peginAmount,
      commissionFee: vault.commissionFee,
      depositorClaimValue: vault.depositorClaimValue,
      peginMaxFee: vault.peginMaxFee,
    })),
    keeperPubkeys: terms.vaultKeeperBtcPubkeys.map((k) => Uint8Array.from(hexToBuffer(k))),
    challengerPubkeys: terms.universalChallengerBtcPubkeys.map((k) => Uint8Array.from(hexToBuffer(k))),
  };
}

// ---------------------------------------------------------------------------
// Pre-PegIn PSBT — the transaction the intent binds to
// (`_validate_prepegin`, fw sign_psbt_validate.c:334-545 @ 4decf822)
// ---------------------------------------------------------------------------

const PREPEGIN_INPUT_COUNT = 2;
/** Distinct but otherwise arbitrary prevout hashes — the device never fetches them. */
const PREPEGIN_PREVOUT_HASH_BASE = 0x40;
/**
 * `_validate_prepegin` (fw `sign_psbt_validate.c:334-545` @ e2d0c45b) does not
 * constrain the sequence — it only hashes it into the txid it compares against
 * the intent (`:283-292`). So this must match what the toolkit's funding path
 * emits: bitcoinjs' DEFAULT_SEQUENCE (fundPeginTransaction.ts:148).
 */
const PREPEGIN_SEQUENCE_FINAL = 0xffffffff;

export interface PrePeginPsbtFixture {
  /** v0, NOT augmented — the test augments it the way the provider does. */
  readonly psbtHex: string;
  /** Raw SHA256d of the unsigned tx (PSBT/internal order) — the intent's prepegin_txid and the PegIn prevout. */
  readonly txidInternal: Buffer;
  readonly htlcScriptPubKey: Buffer;
}

/**
 * Toolkit-shaped Pre-PegIn: two depositor key-path inputs → [HTLC, CPFP anchor
 * 546 P2TR(depositor), change P2TR(changeKey)]. No OP_RETURN (optional on-device).
 * Layout matches btc-vault `[HTLC×n, OP_RETURN?, anchor, change*]`.
 */
export function buildPrePeginPsbt(hashlock: Buffer, changeXOnlyHex: string): PrePeginPsbtFixture {
  const depositor = hexToBuffer(DEPOSITOR_XONLY_HEX);
  const vp = hexToBuffer(VP_KEY_HEX);
  const keepers = [hexToBuffer(KEEPER_KEY_HEX)];
  const challengers = [hexToBuffer(CHALLENGER_KEY_HEX)];
  const leaf0 = htlcLeaf0(depositor, vp, keepers, challengers, hashlock);
  const leaf1 = htlcLeaf1(depositor, HTLC_REFUND_TIMELOCK);
  const merkleRoot = tapBranch(tapLeafHash(TAPSCRIPT_LEAF_VERSION, leaf0), tapLeafHash(TAPSCRIPT_LEAF_VERSION, leaf1));
  const htlcScriptPubKey = Buffer.concat([Buffer.from([0x51, PUSH_32]), tweakNums(merkleRoot).xOnly]);
  const depositorSpk = payments.p2tr({ internalPubkey: depositor }).output!;
  const changeSpk = payments.p2tr({ internalPubkey: hexToBuffer(changeXOnlyHex) }).output!;
  const changeValue =
    PREPEGIN_INPUT_COUNT * PREPEGIN_INPUT_VALUE_SATS - HTLC_VALUE_SATS - CPFP_ANCHOR_VALUE_SATS - PREPEGIN_FEE_SATS;

  const psbt = new Psbt();
  psbt.setVersion(2); // fw requires tx_version >= 2
  psbt.setLocktime(0);
  for (let i = 0; i < PREPEGIN_INPUT_COUNT; i++) {
    psbt.addInput({
      hash: Buffer.alloc(32, PREPEGIN_PREVOUT_HASH_BASE + i),
      index: i,
      sequence: PREPEGIN_SEQUENCE_FINAL,
      witnessUtxo: { script: depositorSpk, value: PREPEGIN_INPUT_VALUE_SATS },
      tapInternalKey: depositor,
    });
  }
  psbt.addOutput({ script: htlcScriptPubKey, value: HTLC_VALUE_SATS });
  psbt.addOutput({ script: depositorSpk, value: CPFP_ANCHOR_VALUE_SATS });
  psbt.addOutput({ script: changeSpk, value: changeValue });
  const tx = Transaction.fromBuffer(psbt.data.globalMap.unsignedTx.toBuffer());
  return { psbtHex: psbt.toHex(), txidInternal: tx.getHash(), htlcScriptPubKey };
}

// ---------------------------------------------------------------------------
// PegIn PSBT (test_sign_psbt_validate.py:309 `_build_pegin_psbt`)
// ---------------------------------------------------------------------------

export interface PeginPsbtFixture {
  readonly psbtHex: string;
  readonly htlcScriptPubKey: Buffer;
  readonly leaf0Script: Buffer;
  readonly leaf0Hash: Buffer;
  readonly controlBlock: Buffer;
}

/** RBF-signalling, per the fw builder. */
const PEGIN_SEQUENCE = 0xfffffffe;

/**
 * PegIn PSBTv0: input 0 spends the HTLC at (prepegin_txid, vout 0) via
 * Leaf 0; outputs are Vault, Depositor Claim, and the P2A anchor. Tx v3
 * (TRUC), locktime 0, sequence {@link PEGIN_SEQUENCE} — all per the fw builder.
 */
export function buildPeginPsbt(hashlock: Buffer, prepeginTxidInternal: Buffer): PeginPsbtFixture {
  const depositor = hexToBuffer(DEPOSITOR_XONLY_HEX);
  const vp = hexToBuffer(VP_KEY_HEX);
  const keepers = [hexToBuffer(KEEPER_KEY_HEX)];
  const challengers = [hexToBuffer(CHALLENGER_KEY_HEX)];

  const leaf0 = htlcLeaf0(depositor, vp, keepers, challengers, hashlock);
  const leaf1 = htlcLeaf1(depositor, HTLC_REFUND_TIMELOCK);
  const leaf0Hash = tapLeafHash(TAPSCRIPT_LEAF_VERSION, leaf0);
  const leaf1Hash = tapLeafHash(TAPSCRIPT_LEAF_VERSION, leaf1);
  const merkleRoot = tapBranch(leaf0Hash, leaf1Hash);
  const { parity, xOnly: htlcTweaked } = tweakNums(merkleRoot);
  const htlcScriptPubKey = Buffer.concat([Buffer.from([0x51, PUSH_32]), htlcTweaked]);
  // Control block for spending Leaf 0: sibling hash is Leaf 1's hash.
  const controlBlock = Buffer.concat([Buffer.from([TAPSCRIPT_LEAF_VERSION | parity]), NUMS_XONLY, leaf1Hash]);

  const vaultSpk = p2trFromSingleLeaf(vaultUtxoLeaf(depositor, vp, keepers, challengers, PEGIN_CSV_TIMELOCK));
  const claimSpk = p2trFromSingleLeaf(depositorClaimLeaf(depositor));

  const psbt = new Psbt();
  psbt.setVersion(3); // TRUC (BIP-431)
  psbt.setLocktime(0);
  psbt.addInput({
    hash: prepeginTxidInternal, // Buffer form: used as-is (internal order)
    index: HTLC_VOUT,
    sequence: PEGIN_SEQUENCE,
    witnessUtxo: { script: htlcScriptPubKey, value: HTLC_VALUE_SATS },
    tapInternalKey: NUMS_XONLY,
    tapMerkleRoot: merkleRoot,
    tapLeafScript: [{ leafVersion: TAPSCRIPT_LEAF_VERSION, script: leaf0, controlBlock }],
  });
  psbt.addOutput({ script: vaultSpk, value: VAULT_AMOUNT_SATS });
  psbt.addOutput({ script: claimSpk, value: DEPOSITOR_CLAIM_VALUE_SATS });
  psbt.addOutput({ script: P2A_SCRIPT_PUB_KEY, value: PEGIN_ANCHOR_VALUE_SATS });

  return { psbtHex: psbt.toHex(), htlcScriptPubKey, leaf0Script: leaf0, leaf0Hash, controlBlock };
}

/**
 * BIP-341 script-path sighash for input 0 at SIGHASH_DEFAULT over the
 * fixture's unsigned tx — the message the device's Schnorr signature must
 * verify against.
 */
export function computePeginSighash(psbtHex: string, fixture: PeginPsbtFixture): Buffer {
  const psbt = Psbt.fromHex(psbtHex);
  const tx = Transaction.fromBuffer(psbt.data.globalMap.unsignedTx.toBuffer());
  return tx.hashForWitnessV1(
    0,
    [fixture.htlcScriptPubKey],
    [HTLC_VALUE_SATS],
    Transaction.SIGHASH_DEFAULT,
    fixture.leaf0Hash,
  );
}

/** BIP-340 verification via the package's own ecc backend. */
export function verifySchnorrSignature(sighash: Buffer, xOnlyKeyHex: string, signature: Uint8Array): boolean {
  return ecc.verifySchnorr(sighash, hexToBuffer(xOnlyKeyHex), signature);
}
