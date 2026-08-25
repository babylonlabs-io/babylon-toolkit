/**
 * Depositor-graph (Payout + NoPayout) fixtures for the Speculos e2e suite,
 * built with the PRODUCTION SDK builders (`buildPayoutPsbt`,
 * `buildNoPayoutPsbt` — the constructors `signDepositorGraph` drives) over
 * VP-shaped parent transactions, so the device sees exactly the PSBTs the
 * dApp would hand it.
 *
 * Roster, amounts and timelocks equal the intent `peginFixture.ts` approves.
 * The WASM connector scripts were pre-verified byte-identical to the firmware
 * leaf builders at the ELF tip: vault-UTXO leaf and Assert:0 payout leaf match
 * fw `tests/test_sign_psbt_validate.py` `_vault_utxo_leaf` / `_assert0_payout_leaf`
 * (@ 29beb88d5), and every control block commits to one Assert:0 spk.
 *
 * The NoPayout comes in TWO shapes per challenger:
 *  - `productionPsbtHex`: input 0 spends Assert:0 — btc-vault
 *    `transactions/nopayout.rs:146-155` and HLD v22 §4.9.8 ("Prevout Assert:0").
 *  - `firmwareShapedPsbtHex`: identical except input 0's prevout txid is the
 *    computed PegIn txid — the shape the firmware's own tests build
 *    (`test_sign_psbt_validate.py:2997`) because `_validate_nopayout` resolves
 *    the vault group by matching that txid (`sign_psbt_validate.c:2196-2219`).
 *  The suite pins the divergence: production shape rejected, firmware shape signs.
 *
 * Conscious call on the §7 audit boundary: importing the SDK/WASM builders here
 * makes them devDependencies, so `build`/`test` for this package now need them
 * built first (they never enter `dist` — the vite lib build excludes tests).
 * The alternative — committing pre-generated vectors — was rejected because a
 * stale vector would silently stop matching what the dApp actually sends.
 *
 * @module ledger-vault-signer/__tests__/e2e/depositorGraphFixture
 */

import {
  computePayoutFeeFloor,
  getAssertNoPayoutScriptInfo,
  getAssertPayoutScriptInfo,
  type AssertPayoutNoPayoutConnectorParams,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { buildNoPayoutPsbt, buildPayoutPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { crypto as bcrypto, initEccLib, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { bip86OutputScript } from "../../expectedSignatures";
import { tapLeafHash } from "../../tapLeafHash";
import {
  CHALLENGER_KEY_HEX,
  DEPOSITOR_XONLY_HEX,
  HTLC_VOUT,
  KEEPER_KEY_HEX,
  PAYOUT_TIMELOCK,
  PEGIN_CSV_TIMELOCK,
  VAULT_AMOUNT_SATS,
  VP_KEY_HEX,
} from "./peginFixture";

// `payments.p2tr` (challenger sink) needs the ecc backend; idempotent.
initEccLib(ecc);

/** BIP-341 tapscript leaf version — matches `TAPSCRIPT_LEAF_VERSION` in the SDK builders. */
const TAPSCRIPT_LEAF_VERSION = 0xc0;

/** The graph the fixture PSBTs are built under (peginFixture terms `vaultCoreVersion: 2`). */
const VAULT_CORE_VERSION = 2;

/** Intent `base_fee_rate` (peginFixture BASE_FEE_RATE) as the SDK's bigint rate. */
const PROTOCOL_FEE_RATE = 1n;

/**
 * Fixture security council (size 1, quorum 1). The council leaf only shapes
 * the Assert:0 taptree — the device never reconstructs it, it rides the
 * control block as a sibling hash (`sign_psbt_validate.c:664-...` commitment
 * walk). Key = BIP-340 test-vector pubkey 1, a known-valid x-only point.
 */
const COUNCIL_MEMBERS = ["f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9"];
const COUNCIL_QUORUM = 1;

/**
 * Assert:0 funding: DUST + council-NoPayout fee at rate 1 (btc-vault funds
 * Assert:0 at `DUST_AMOUNT + council_nopayout_fee`; 386 vB fixture vsize per
 * the KB H3 row). Inside the device band [546, 546 + rate×500]
 * (`sign_psbt_validate.c:1646-1658` payout, `:2114-2126` nopayout).
 */
const ASSERT0_VALUE_SATS = 546 + 386;

/** Non-VP payout Out1 must be exactly DUST (`sign_psbt_validate.c:1898-1904`). */
const PAYOUT_ANCHOR_VALUE_SATS = 546;

/** ChallengeAssert connector value: device requires ≤ DUST (`sign_psbt_validate.c:2149-2167`). */
const CHALLENGE_ASSERT_CONNECTOR_VALUE_SATS = 546;

/** Fixture `timelock_challenge_assert` (nopayout.rs:157-176 CAX/CAY sequences); device reads no NoPayout sequence. */
const CHALLENGE_ASSERT_TIMELOCK = 72;

/** Fixture NoPayout fee; the device validates the output's spk, never its value (`sign_psbt_validate.c:2169-2188`). */
const NOPAYOUT_FEE_SATS = 400;

/** btc-vault tx literals: Payout/NoPayout are version 2, locktime 0 (payout.rs / nopayout.rs). */
const GRAPH_TX_VERSION = 2;
const GRAPH_TX_LOCKTIME = 0;

/** NoPayout Assert-input sequence (nopayout.rs:153 `Sequence::MAX`). */
const SEQUENCE_MAX = 0xffffffff;

/** SDK fee-floor shape inputs: out0 is the 34-byte BIP-86 P2TR, out1 absent (2-output layout). */
const BIP86_P2TR_SCRIPT_LEN = 34;

/** Parent-tx prevout fill bytes — distinct, arbitrary; the device never fetches parents. */
const ASSERT_PARENT_PREVOUT_FILL = 0xaa;
const CHALLENGE_ASSERT_PREVOUT_FILL_BASE = 0xb0;

const hexToBuffer = (hex: string): Buffer => Buffer.from(hex, "hex");

/**
 * Depositor-graph challenger roster: local ∪ universal. Depositor-as-claimer
 * local challengers = vault keepers only, VP excluded (SDK
 * `deriveLocalChallengers`, btc-vault `graph.rs derive_challengers_for`).
 */
export const DEPOSITOR_GRAPH_CHALLENGERS: readonly string[] = [KEEPER_KEY_HEX, CHALLENGER_KEY_HEX];

interface NoPayoutChallengerFixture {
  readonly challengerXOnlyHex: string;
  /** btc-vault shape — input 0 spends Assert:0 (nopayout.rs:146-155). */
  readonly productionPsbtHex: string;
  /** fw-test shape — input 0's prevout txid = PegIn txid (test_sign_psbt_validate.py:2997). */
  readonly firmwareShapedPsbtHex: string;
  /** TapLeaf hash of the 68-byte `<D> OP_CHECKSIGVERIFY <Cj> OP_CHECKSIG` leaf. */
  readonly noPayoutLeafHashHex: string;
}

export interface DepositorGraphFixture {
  readonly payoutPsbtHex: string;
  /** Input 0's Vault-UTXO leaf hash — the single yield the firmware produces. */
  readonly payoutInput0LeafHashHex: string;
  /** Input 1's Assert:0 payout leaf hash — the yield the HOST table also expects. */
  readonly payoutInput1LeafHashHex: string;
  readonly perChallenger: readonly NoPayoutChallengerFixture[];
}

/** BIP-341 output script from a tapscript leaf + its control block (internal key + sibling path). */
function taprootSpkFromLeafScript(scriptHex: string, controlBlockHex: string): Buffer {
  const controlBlock = hexToBuffer(controlBlockHex);
  const internalKey = controlBlock.subarray(1, 33);
  let node = tapLeafHash(TAPSCRIPT_LEAF_VERSION, hexToBuffer(scriptHex));
  for (let offset = 33; offset < controlBlock.length; offset += 32) {
    const sibling = controlBlock.subarray(offset, offset + 32);
    const [left, right] = Buffer.compare(node, sibling) <= 0 ? [node, sibling] : [sibling, node];
    node = bcrypto.taggedHash("TapBranch", Buffer.concat([left, right]));
  }
  const tweak = bcrypto.taggedHash("TapTweak", Buffer.concat([internalKey, node]));
  const tweaked = ecc.xOnlyPointAddTweak(internalKey, tweak);
  if (tweaked === null) {
    throw new Error("control block internal key has no taproot output key");
  }
  return Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.from(tweaked.xOnlyPubkey)]);
}

/** Minimal VP-side parent transaction: one dummy input, the given outputs. */
function buildParentTx(prevoutFill: number, outputs: readonly { script: Buffer; value: number }[]): Transaction {
  const tx = new Transaction();
  tx.version = GRAPH_TX_VERSION;
  tx.locktime = GRAPH_TX_LOCKTIME;
  tx.addInput(Buffer.alloc(32, prevoutFill), 0, SEQUENCE_MAX);
  for (const output of outputs) {
    tx.addOutput(output.script, output.value);
  }
  return tx;
}

/**
 * Build the depositor-as-claimer graph fixture bound to the suite's signed
 * PegIn: Payout PSBT + per-challenger NoPayout PSBTs (both shapes), via the
 * production SDK builders.
 *
 * @param peginTxHex the fixture PegIn's raw unsigned tx (its txid is the
 *   Vault-UTXO prevout the firmware recomputes from the intent)
 */
export async function buildDepositorGraphFixture(peginTxHex: string): Promise<DepositorGraphFixture> {
  const peginTx = Transaction.fromHex(peginTxHex);

  const connectorParams: AssertPayoutNoPayoutConnectorParams = {
    txGraphVersion: VAULT_CORE_VERSION,
    claimer: DEPOSITOR_XONLY_HEX,
    // Depositor-as-claimer local challengers = keepers only (VP excluded).
    localChallengers: [KEEPER_KEY_HEX],
    universalChallengers: [CHALLENGER_KEY_HEX],
    timelockAssert: PAYOUT_TIMELOCK,
    councilMembers: COUNCIL_MEMBERS,
    councilQuorum: COUNCIL_QUORUM,
  };

  // Assert:0 — the one output every graph leaf's control block commits to.
  const payoutLeafInfo = await getAssertPayoutScriptInfo(connectorParams);
  const assert0Spk = taprootSpkFromLeafScript(payoutLeafInfo.payoutScript, payoutLeafInfo.payoutControlBlock);
  const assertTx = buildParentTx(ASSERT_PARENT_PREVOUT_FILL, [{ script: assert0Spk, value: ASSERT0_VALUE_SATS }]);

  // --- Payout transaction, as the VP builds it (payout.rs; fee = SDK floor,
  // inside both bands: floor ≤ fee ≤ rate×(500+55×(N+M)) — fw
  // `sign_psbt_validate.c:1949-1973`, SDK assertPayoutFeeBand).
  const payoutFeeSats = Number(
    await computePayoutFeeFloor(
      VAULT_CORE_VERSION,
      connectorParams.localChallengers.length,
      connectorParams.universalChallengers.length,
      connectorParams.localChallengers.length,
      COUNCIL_MEMBERS.length,
      BIP86_P2TR_SCRIPT_LEN,
      undefined,
      PROTOCOL_FEE_RATE,
    ),
  );
  const depositorBip86Spk = bip86OutputScript(DEPOSITOR_XONLY_HEX);
  const payoutTx = new Transaction();
  payoutTx.version = GRAPH_TX_VERSION;
  payoutTx.locktime = GRAPH_TX_LOCKTIME;
  payoutTx.addInput(peginTx.getHash(), HTLC_VOUT, PEGIN_CSV_TIMELOCK);
  payoutTx.addInput(assertTx.getHash(), 0, PAYOUT_TIMELOCK);
  // Depositor claimer: Out0 = V + assert0 − fee − DUST to BIP-86(D), Out1 =
  // DUST CPFP anchor to BIP-86(D) — both script-verified on-device
  // (`sign_psbt_validate.c:1817-1831, 1864-1916`).
  payoutTx.addOutput(
    depositorBip86Spk,
    VAULT_AMOUNT_SATS + ASSERT0_VALUE_SATS - payoutFeeSats - PAYOUT_ANCHOR_VALUE_SATS,
  );
  payoutTx.addOutput(depositorBip86Spk, PAYOUT_ANCHOR_VALUE_SATS);

  const { psbtHex: payoutPsbtHex } = await buildPayoutPsbt({
    vaultCoreVersion: VAULT_CORE_VERSION,
    payoutTxHex: payoutTx.toHex(),
    assertTxHex: assertTx.toHex(),
    peginTxHex,
    depositorBtcPubkey: DEPOSITOR_XONLY_HEX,
    vaultProviderBtcPubkey: VP_KEY_HEX,
    vaultKeeperBtcPubkeys: [KEEPER_KEY_HEX],
    universalChallengerBtcPubkeys: [CHALLENGER_KEY_HEX],
    timelockPegin: PEGIN_CSV_TIMELOCK,
    timelockAssert: PAYOUT_TIMELOCK,
    network: "signet",
    claimerBtcPubkey: DEPOSITOR_XONLY_HEX,
    registeredPayoutScriptPubKey: depositorBip86Spk.toString("hex"),
    commissionBps: 1, // inert for the depositor-as-claimer role (signDepositorGraph.ts:67-70)
    protocolFeeRate: PROTOCOL_FEE_RATE,
    councilMembers: COUNCIL_MEMBERS,
    councilQuorum: COUNCIL_QUORUM,
    vkClaimerPayoutScriptPubKeys: {},
    vpCommissionScriptPubKey: depositorBip86Spk.toString("hex"), // unused for this role
  });

  // --- NoPayout per challenger, both shapes.
  const perChallenger: NoPayoutChallengerFixture[] = [];
  for (const [challengerIndex, challengerXOnlyHex] of DEPOSITOR_GRAPH_CHALLENGERS.entries()) {
    const noPayoutInfo = await getAssertNoPayoutScriptInfo(connectorParams, challengerXOnlyHex);
    // Same taptree ⇒ same Assert:0 spk as the payout leaf's — fail loudly on drift.
    const noPayoutSpk = taprootSpkFromLeafScript(noPayoutInfo.noPayoutScript, noPayoutInfo.noPayoutControlBlock);
    if (!noPayoutSpk.equals(assert0Spk)) {
      throw new Error(`NoPayout control block for ${challengerXOnlyHex} binds a different Assert:0 spk`);
    }

    // Placeholder connector spk (fw test_sign_psbt_validate.py:2991): the
    // device checks connector VALUES only, never their scripts.
    const connectorSpk = Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32)]);
    const challengeAssertX = buildParentTx(CHALLENGE_ASSERT_PREVOUT_FILL_BASE + 2 * challengerIndex, [
      { script: connectorSpk, value: CHALLENGE_ASSERT_CONNECTOR_VALUE_SATS },
    ]);
    const challengeAssertY = buildParentTx(CHALLENGE_ASSERT_PREVOUT_FILL_BASE + 2 * challengerIndex + 1, [
      { script: connectorSpk, value: CHALLENGE_ASSERT_CONNECTOR_VALUE_SATS },
    ]);

    // Output 0 pays P2TR(key-path tweak of Cj) — `sign_psbt_validate.c:2169-2188`.
    const challengerSink = payments.p2tr({ internalPubkey: hexToBuffer(challengerXOnlyHex) }).output!;
    const totalInSats =
      ASSERT0_VALUE_SATS + CHALLENGE_ASSERT_CONNECTOR_VALUE_SATS + CHALLENGE_ASSERT_CONNECTOR_VALUE_SATS;

    const buildNoPayoutTx = (input0PrevoutTxid: Buffer): Transaction => {
      const tx = new Transaction();
      tx.version = GRAPH_TX_VERSION;
      tx.locktime = GRAPH_TX_LOCKTIME;
      tx.addInput(input0PrevoutTxid, 0, SEQUENCE_MAX);
      tx.addInput(challengeAssertX.getHash(), 0, CHALLENGE_ASSERT_TIMELOCK);
      tx.addInput(challengeAssertY.getHash(), 0, CHALLENGE_ASSERT_TIMELOCK);
      tx.addOutput(challengerSink, totalInSats - NOPAYOUT_FEE_SATS);
      return tx;
    };

    const prevouts = [
      { script_pubkey: assert0Spk.toString("hex"), value: ASSERT0_VALUE_SATS },
      { script_pubkey: connectorSpk.toString("hex"), value: CHALLENGE_ASSERT_CONNECTOR_VALUE_SATS },
      { script_pubkey: connectorSpk.toString("hex"), value: CHALLENGE_ASSERT_CONNECTOR_VALUE_SATS },
    ];
    const [productionPsbtHex, firmwareShapedPsbtHex] = await Promise.all([
      buildNoPayoutPsbt({
        noPayoutTxHex: buildNoPayoutTx(assertTx.getHash()).toHex(),
        challengerPubkey: challengerXOnlyHex,
        prevouts,
        connectorParams,
      }),
      buildNoPayoutPsbt({
        noPayoutTxHex: buildNoPayoutTx(peginTx.getHash()).toHex(),
        challengerPubkey: challengerXOnlyHex,
        prevouts,
        connectorParams,
      }),
    ]);

    perChallenger.push({
      challengerXOnlyHex,
      productionPsbtHex,
      firmwareShapedPsbtHex,
      noPayoutLeafHashHex: tapLeafHash(TAPSCRIPT_LEAF_VERSION, hexToBuffer(noPayoutInfo.noPayoutScript)).toString(
        "hex",
      ),
    });
  }

  return {
    payoutPsbtHex,
    // Input 0's Vault-UTXO leaf is derived inside buildPayoutPsbt — read it
    // off the built PSBT rather than re-deriving.
    payoutInput0LeafHashHex: leafHashOfPsbtInput(payoutPsbtHex, 0),
    payoutInput1LeafHashHex: tapLeafHash(TAPSCRIPT_LEAF_VERSION, hexToBuffer(payoutLeafInfo.payoutScript)).toString(
      "hex",
    ),
    perChallenger,
  };
}

/** TapLeaf hash of the single tapLeafScript the SDK attached to `inputIndex`. */
function leafHashOfPsbtInput(psbtHex: string, inputIndex: number): string {
  const leaves = Psbt.fromHex(psbtHex).data.inputs[inputIndex].tapLeafScript;
  if (leaves === undefined || leaves.length !== 1) {
    throw new Error(`payout PSBT input ${inputIndex} must carry exactly one tapLeafScript`);
  }
  return tapLeafHash(TAPSCRIPT_LEAF_VERSION, leaves[0].script).toString("hex");
}
