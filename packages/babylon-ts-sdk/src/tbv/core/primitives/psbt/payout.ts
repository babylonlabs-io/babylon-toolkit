/**
 * Payout PSBT Builder Primitives
 *
 * This module provides pure functions for building unsigned payout PSBTs and extracting
 * Schnorr signatures from signed PSBTs. It uses WASM-generated scripts from the payout
 * connector and bitcoinjs-lib for PSBT construction.
 *
 * The Payout transaction references the Assert transaction (input 1).
 *
 * @module primitives/psbt/payout
 */

import {
  getAssertPayoutScriptInfo,
  tapInternalPubkey,
  type Network,
} from "../../wasm";
import { Psbt, Transaction, type TxInput, type TxOutput } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { deriveLocalChallengers } from "../challengers";
import { createPayoutScript } from "../scripts/payout";
import {
  TAPSCRIPT_LEAF_VERSION,
  deriveBip86ScriptPubKeyHex,
  hexToUint8Array,
  isValidHex,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../utils/bitcoin";
import { computeTaprootScriptPubKey } from "../utils/taproot";
import {
  assertPayoutFeeBandDomain,
  assertPayoutFeeInBand,
} from "./assertPayoutFeeBand";
import {
  ASSERT_PAYOUT_OUTPUT_INDEX,
  BPS_DENOMINATOR,
  DEPOSITOR_PAYOUT_INPUT_COUNT,
  MAX_PAYOUT_SCRIPT_LEN,
  MAX_VP_COMMISSION_BPS_EXCLUSIVE,
  NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT,
  PAYOUT_ANCHOR_DUST_SATS,
  PAYOUT_TX_LOCKTIME,
  PAYOUT_TX_VERSION,
  PEGIN_VAULT_OUTPUT_INDEX,
  VP_CLAIMER_PAYOUT_OUTPUT_COUNT,
} from "./constants";
import { assertStandardPayoutScript } from "./standardPayoutScript";

/**
 * Number of items in a Taproot script-path spend witness stack for a
 * single-signature script: [signature, script, controlBlock].
 *
 * The current payout script requires exactly one depositor signature. If the
 * protocol evolves to require multiple signatures in the payout script, this
 * invariant and the finalized-PSBT extraction path must be revisited because
 * the first witness item would no longer necessarily be the depositor's.
 */
const TAPROOT_SINGLE_SIG_WITNESS_STACK_SIZE = 3;

/**
 * Parameters for building an unsigned Payout PSBT
 *
 * Payout is used in the challenge path after Assert, when the claimer proves validity.
 * Input 1 references the Assert transaction.
 */
export interface PayoutParams {
  /**
   * Vault core (tx-graph) version the vault was registered under — the
   * vault's stamped on-chain `vaultCoreVersion`. Selects which graph's
   * payout connector scripts are derived.
   */
  vaultCoreVersion: number;

  /**
   * Payout transaction hex (unsigned)
   * This is the transaction that needs to be signed by the depositor
   */
  payoutTxHex: string;

  /**
   * Assert transaction hex
   * Payout input 1 references Assert output 0
   */
  assertTxHex: string;

  /**
   * Peg-in transaction hex
   * This transaction created the vault output that we're spending
   */
  peginTxHex: string;

  /**
   * Depositor's BTC public key (x-only, 64-char hex without 0x prefix)
   */
  depositorBtcPubkey: string;

  /**
   * Vault provider's BTC public key (x-only, 64-char hex)
   */
  vaultProviderBtcPubkey: string;

  /**
   * Vault keeper BTC public keys (x-only, 64-char hex)
   */
  vaultKeeperBtcPubkeys: string[];

  /**
   * Universal challenger BTC public keys (x-only, 64-char hex)
   */
  universalChallengerBtcPubkeys: string[];

  /**
   * CSV timelock in blocks for the PegIn output (btc-vault `timelock_pegin`);
   * payout input 0's sequence.
   */
  timelockPegin: number;

  /**
   * CSV timelock in blocks on the Assert:0 payout leaf (btc-vault
   * `timelock_assert`); payout input 1's sequence.
   */
  timelockAssert: number;

  /**
   * Bitcoin network
   */
  network: Network;

  /**
   * Claimer's x-only BTC public key (64-char hex, no prefix). Drives role
   * inference (VP / depositor-as-claimer / VK-claimer) inside `buildPayoutPsbt`.
   */
  claimerBtcPubkey: string;

  /**
   * On-chain registered depositor payout scriptPubKey (hex, 0x optional).
   * Expected outs[0].script for VP- and depositor-claimer roles; unused for
   * VK-claimer (its outs[0].script is derived from `claimerBtcPubkey`).
   */
  registeredPayoutScriptPubKey: string;

  /**
   * VP commission in basis points (`BTCVaultRegistry.vaultProviderCommissionBps`).
   * Caps the VP-claimer outs[1].value. The protocol minimum is enforced
   * upstream; here only `0 <= bps < 10_000` is checked, for safe cap math.
   */
  commissionBps: number;

  /**
   * Tx-graph fee rate (sat/vB) the graph was built with — the version-locked
   * `offchainParams.feeRate` at the vault's stamped `offchainParamsVersion`,
   * NOT a live read. Anchors both ends of the fee band.
   */
  protocolFeeRate: bigint;

  /**
   * Security council member x-only public keys (hex) from the locked offchain
   * params version — `getOffchainParamsByVersion(...).securityCouncilKeys`.
   * The council occupies the last leaf of the Assert:0 taptree
   * (btc-vault `crates/vault/src/connectors/assert_payout_nopayout_council.rs`),
   * so the keys are needed to rebuild input 1's payout leaf, and the count
   * feeds the fee-band domain.
   */
  councilMembers: string[];

  /**
   * M-of-N council quorum from the locked offchain params version —
   * `getOffchainParamsByVersion(...).councilQuorum`. Shapes the council leaf's
   * multisig script, and with it the Assert:0 taptree root.
   */
  councilQuorum: number;

  /**
   * RFC-006. Expected `outs[0].script` per vault-keeper claimer, keyed by
   * lowercased x-only **operation** pubkey (no `0x`), resolved from
   * `ApplicationRegistry.getPayoutScriptAtEpoch` at the vault's frozen
   * `appKeeperKeyEpoch`.
   *
   * Every VK claimer must be present: a claimer missing from the map is an
   * error rather than a cue to derive BIP-86, because a gap means resolution
   * was incomplete and we do not know what that keeper registered.
   *
   * Each entry accepts either that registered script or the BIP-86 default of
   * the same bonded key, so graphs built before btc-vault#2440 remain signable
   * — see {@link acceptedPayoutScriptHexes} for why that is required and when
   * it can be dropped.
   */
  vkClaimerPayoutScriptPubKeys: Readonly<Record<string, string>>;

  /**
   * RFC-006. Expected `outs[1].script` for the VP-claimer commission output,
   * from `BTCVaultRegistry.getPayoutScriptAtEpoch` at the vault's frozen
   * `vpKeyEpoch`. The BIP-86 default of the bonded VP key is accepted alongside
   * it — see {@link acceptedPayoutScriptHexes}.
   */
  vpCommissionScriptPubKey: string;
}

/**
 * Result of building an unsigned payout PSBT
 */
export interface PayoutPsbtResult {
  /**
   * Unsigned PSBT hex ready for signing
   */
  psbtHex: string;
}

/**
 * Build unsigned Payout PSBT for depositor to sign.
 *
 * Payout is used in the **challenge path** when the claimer proves validity:
 * 1. Vault provider submits Claim transaction
 * 2. Challenge is raised during challenge period
 * 3. Claimer submits Assert transaction to prove validity
 * 4. Payout can be executed (references Assert tx)
 *
 * Payout transactions have the following structure:
 * - Input 0: from PeginTx output0 (signed by depositor)
 * - Input 1: from Assert output0 (NOT signed by depositor)
 *
 * Both inputs carry their taproot script-path leaf. Input 1's is not signed
 * here — it is what a hardware signer reads to display the payout terms.
 *
 * @param params - Payout parameters
 * @returns Unsigned PSBT ready for depositor to sign
 *
 * @throws If payout transaction does not have exactly 2 inputs
 * @throws If input 0 does not spend PegIn:0 (vault UTXO)
 * @throws If input 1 does not spend Assert:0 (proof output)
 * @throws If previous output is not found for either input
 * @throws If sum of output values exceeds sum of input values (invalid tx)
 * @throws If the implicit fee (inputs − outputs) is outside the fee band —
 *   below the floor or above the fee-band ceiling (see
 *   {@link assertPayoutFeeInBand})
 * @throws If `protocolFeeRate`, a participant count, or the council size is
 *   outside the accepted input domain (see {@link assertPayoutFeeBandDomain})
 * @throws If a non-anchor scriptPubKey length is outside `[1,
 *   {@link MAX_PAYOUT_SCRIPT_LEN}]`
 * @throws If `claimerBtcPubkey` is not VP, depositor, or a registered VK
 * @throws If payout output count, outs[0] script, outs[last] anchor value, or
 *   (VP-claimer) outs[1] commission cap do not match the protocol layout
 * @throws If `commissionBps` is not a non-negative integer below 10_000
 * @throws If the locally rebuilt Assert:0 payout leaf does not bind to the
 *   Assert output input 1 spends
 */
export async function buildPayoutPsbt(
  params: PayoutParams,
): Promise<PayoutPsbtResult> {
  const feeBandParams = {
    vaultCoreVersion: params.vaultCoreVersion,
    numVaultKeepers: params.vaultKeeperBtcPubkeys.length,
    numUniversalChallengers: params.universalChallengerBtcPubkeys.length,
    councilSize: params.councilMembers.length,
    protocolFeeRate: params.protocolFeeRate,
  };
  assertPayoutFeeBandDomain(feeBandParams);

  const payoutTx = Transaction.fromHex(stripHexPrefix(params.payoutTxHex));
  const peginTx = Transaction.fromHex(stripHexPrefix(params.peginTxHex));
  const assertTx = Transaction.fromHex(stripHexPrefix(params.assertTxHex));

  if (payoutTx.ins.length !== DEPOSITOR_PAYOUT_INPUT_COUNT) {
    throw new Error(
      `Payout transaction must have exactly ${DEPOSITOR_PAYOUT_INPUT_COUNT} ` +
        `inputs, got ${payoutTx.ins.length}`,
    );
  }
  // btc-vault builds every payout with these literals (payout.rs:154-155);
  // the sighash commits to them, so refuse rather than sign a foreign shape.
  if (payoutTx.version !== PAYOUT_TX_VERSION) {
    throw new Error(
      `Payout transaction version ${payoutTx.version} must be ` +
        `${PAYOUT_TX_VERSION}; refusing to sign payout.`,
    );
  }
  if (payoutTx.locktime !== PAYOUT_TX_LOCKTIME) {
    throw new Error(
      `Payout transaction locktime ${payoutTx.locktime} must be ` +
        `${PAYOUT_TX_LOCKTIME}; refusing to sign payout.`,
    );
  }
  // Input sequences carry the CSV timelocks (payout.rs:108,119). Each is
  // checked after its own outpoint resolves so a wrong prevout reports itself.
  const peginPrevOut = requirePrevOut(
    payoutTx.ins[0],
    0,
    peginTx,
    "PegIn",
    PEGIN_VAULT_OUTPUT_INDEX,
  );
  if (payoutTx.ins[0].sequence !== params.timelockPegin) {
    throw new Error(
      `Payout input 0 sequence ${payoutTx.ins[0].sequence} must equal the ` +
        `PegIn CSV timelock ${params.timelockPegin}; refusing to sign payout.`,
    );
  }

  const assertPrevOut = requirePrevOut(
    payoutTx.ins[1],
    1,
    assertTx,
    "Assert",
    ASSERT_PAYOUT_OUTPUT_INDEX,
  );
  if (payoutTx.ins[1].sequence !== params.timelockAssert) {
    throw new Error(
      `Payout input 1 sequence ${payoutTx.ins[1].sequence} must equal the ` +
        `Assert CSV timelock ${params.timelockAssert}; refusing to sign payout.`,
    );
  }
  // Assert:0's value is deliberately NOT validated: the taproot sighash
  // commits to input 1's amount and outpoint, so a misstated value yields a
  // signature invalid against the real Assert tx — nothing to protect. (The
  // device pins the band [546, 546 + base_fee_rate*500] here, Q15.)

  // Per-role output validation — blocks an extra attacker output or value
  // routed into a non-payout slot. Returns the layout-trusted script lengths
  // the fee band consumes.
  const { out0Len, out1Len } = assertPayoutOutputLayout(
    payoutTx,
    peginPrevOut.value,
    params,
  );

  const inputValueSats = peginPrevOut.value + assertPrevOut.value;
  let outputValueSats = 0;
  for (const out of payoutTx.outs) outputValueSats += out.value;
  if (outputValueSats > inputValueSats) {
    throw new Error(
      `Payout outputs (${outputValueSats} sats) exceed inputs ` +
        `(${inputValueSats} sats); invalid transaction.`,
    );
  }
  const implicitFeeSats = inputValueSats - outputValueSats;
  await assertPayoutFeeInBand(feeBandParams, {
    implicitFeeSats,
    out0Len,
    out1Len,
  });

  // Only assembly needs the WASM-derived scripts — derive them after the
  // transaction has passed every validation gate.
  const payoutConnector = await createPayoutScript({
    vaultCoreVersion: params.vaultCoreVersion,
    depositor: params.depositorBtcPubkey,
    vaultProvider: params.vaultProviderBtcPubkey,
    vaultKeepers: params.vaultKeeperBtcPubkeys,
    universalChallengers: params.universalChallengerBtcPubkeys,
    timelockPegin: params.timelockPegin,
    network: params.network,
  });

  const assertPayoutLeaf = await resolveAssertPayoutLeaf(params, assertPrevOut);

  return {
    psbtHex: assemblePayoutPsbt(
      payoutTx,
      peginPrevOut,
      assertPrevOut,
      payoutConnector,
      assertPayoutLeaf,
    ),
  };
}

/** The Assert:0 payout tapscript leaf, as attached to payout input 1. */
interface AssertPayoutLeaf {
  script: Uint8Array;
  controlBlock: Uint8Array;
}

/**
 * Rebuild the Assert:0 payout leaf from the vault's on-chain participant set
 * and assert it spends `assertPrevOut`.
 *
 * The depositor does not sign input 1, but the Ledger vault app reads this leaf
 * off the PSBT to display the payout terms
 * (`sign_psbt_validate.c::vault_read_payout_leaf_script`), so a leaf that
 * belonged to a different taptree would show the depositor terms the
 * transaction cannot actually enforce. Critical Path #3: derive, then bind to
 * the real previous output — never forward VP-supplied bytes.
 *
 * @internal Helper invoked by {@link buildPayoutPsbt}.
 */
async function resolveAssertPayoutLeaf(
  params: PayoutParams,
  assertPrevOut: TxOutput,
): Promise<AssertPayoutLeaf> {
  const { payoutScript, payoutControlBlock } = await getAssertPayoutScriptInfo({
    txGraphVersion: params.vaultCoreVersion,
    claimer: stripHexPrefix(params.claimerBtcPubkey).toLowerCase(),
    localChallengers: deriveLocalChallengers({
      claimerBtcPubkey: params.claimerBtcPubkey,
      depositorBtcPubkey: params.depositorBtcPubkey,
      vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
    }),
    universalChallengers: params.universalChallengerBtcPubkeys.map((k) =>
      stripHexPrefix(k).toLowerCase(),
    ),
    timelockAssert: params.timelockAssert,
    councilMembers: params.councilMembers.map((k) =>
      stripHexPrefix(k).toLowerCase(),
    ),
    councilQuorum: params.councilQuorum,
  });

  const script = hexToUint8Array(payoutScript);
  const controlBlock = hexToUint8Array(payoutControlBlock);
  const boundScriptPubKey = computeTaprootScriptPubKey({
    leafVersion: TAPSCRIPT_LEAF_VERSION,
    script,
    controlBlock,
  });
  if (!assertPrevOut.script.equals(boundScriptPubKey)) {
    throw new Error(
      `Rebuilt Assert:0 payout leaf does not spend the Assert output being ` +
        `referenced: leaf binds to ${boundScriptPubKey.toString("hex")}, ` +
        `Assert:${ASSERT_PAYOUT_OUTPUT_INDEX} pays ` +
        `${assertPrevOut.script.toString("hex")}; refusing to sign payout.`,
    );
  }

  return { script, controlBlock };
}

/**
 * Verify `payoutTx.ins[inputIndex]` spends `parentTx:expectedVout` (both txid
 * AND vout — the vout is the input-side anchor that prevents a malicious VP
 * from binding the depositor's signature to a different output of the same
 * parent) and return the referenced previous output.
 *
 * @internal Helper invoked by {@link buildPayoutPsbt}.
 */
function requirePrevOut(
  input: TxInput,
  inputIndex: number,
  parentTx: Transaction,
  parentLabel: string,
  expectedVout: number,
): TxOutput {
  const inputTxid = uint8ArrayToHex(
    new Uint8Array(input.hash).slice().reverse(),
  );
  const parentTxid = parentTx.getId();
  if (inputTxid !== parentTxid || input.index !== expectedVout) {
    throw new Error(
      `Input ${inputIndex} must spend ${parentLabel}:${expectedVout}. ` +
        `Expected ${parentTxid}:${expectedVout}, got ${inputTxid}:${input.index}`,
    );
  }
  const prevOut = parentTx.outs[input.index];
  if (!prevOut) {
    throw new Error(
      `Previous output not found for input ${inputIndex} ` +
        `(txid: ${inputTxid}, index: ${input.index})`,
    );
  }
  return prevOut;
}

/**
 * Assemble the unsigned PSBT from the validated payout transaction.
 *
 * IMPORTANT: For Taproot SIGHASH_DEFAULT (0x00), the sighash commits to ALL
 * inputs' prevouts, not just the one being signed — both inputs must be in
 * the PSBT so the wallet computes the sighash the VP expects.
 *
 * @internal Helper invoked by {@link buildPayoutPsbt}.
 */
function assemblePayoutPsbt(
  payoutTx: Transaction,
  peginPrevOut: TxOutput,
  assertPrevOut: TxOutput,
  payoutConnector: { payoutScript: string; payoutControlBlock: string },
  assertPayoutLeaf: AssertPayoutLeaf,
): string {
  const psbt = new Psbt();
  psbt.setVersion(payoutTx.version);
  psbt.setLocktime(payoutTx.locktime);

  const [input0, input1] = payoutTx.ins;

  // Input 0: depositor signs via Taproot script path — carries tapLeafScript.
  psbt.addInput({
    hash: input0.hash,
    index: input0.index,
    sequence: input0.sequence,
    witnessUtxo: {
      script: peginPrevOut.script,
      value: peginPrevOut.value,
    },
    tapLeafScript: [
      {
        leafVersion: TAPSCRIPT_LEAF_VERSION,
        script: Buffer.from(hexToUint8Array(payoutConnector.payoutScript)),
        controlBlock: Buffer.from(
          hexToUint8Array(payoutConnector.payoutControlBlock),
        ),
      },
    ],
    tapInternalKey: Buffer.from(tapInternalPubkey),
    // sighashType omitted - defaults to SIGHASH_DEFAULT (0x00) for Taproot
  });

  // Input 1: from Assert — not signed by the depositor, but the Ledger vault
  // app reads the payout leaf here to display the terms, so it must be present.
  psbt.addInput({
    hash: input1.hash,
    index: input1.index,
    sequence: input1.sequence,
    witnessUtxo: {
      script: assertPrevOut.script,
      value: assertPrevOut.value,
    },
    tapLeafScript: [
      {
        leafVersion: TAPSCRIPT_LEAF_VERSION,
        script: Buffer.from(assertPayoutLeaf.script),
        controlBlock: Buffer.from(assertPayoutLeaf.controlBlock),
      },
    ],
    tapInternalKey: Buffer.from(tapInternalPubkey),
  });

  for (const output of payoutTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}

/**
 * The scriptPubKeys a payout output may legitimately pay for `bondedPubkey`.
 *
 * ## What this is
 *
 * A deliberate dual-accept: both the operator's RFC-006 **registered** payout
 * script and the **BIP-86 default** of its bonded operation key are treated as
 * valid destinations for the same output.
 *
 * ## Why both forms exist
 *
 * A vault provider running a daemon that predates btc-vault#2440 computes
 * operator payout destinations itself, via BIP-86 over the bonded operation
 * key. From #2440 onward it reads them from the registry instead
 * (`getPayoutScriptAtEpoch`), so an operator can point payouts at cold custody.
 *
 * The two forms are not a transition state that resolves on its own. A payout
 * graph is built once, at BaBe Setup, and is **never rebuilt** — so a vault
 * whose graph was built before its network's #2440 upgrade pays BIP-86 for the
 * rest of its life. Accepting only the registered form makes every such vault
 * permanently unsignable: the depositor can never complete the deposit, and
 * the BTC is already committed by then. Confirmed on devnet 2026-08-04, where
 * a pre-upgrade vault failed exactly this way.
 *
 * ## Why this is not a weakening
 *
 * Both candidates are derived here from on-chain state — the registry read and
 * a local BIP-86 derivation over the bonded key. Neither is taken from the VP's
 * response, so a substituted or attacker-chosen script still fails.
 *
 * The only substitution this permits is between two destinations the *same
 * operator* already controls, which moves that operator's own funds between its
 * own addresses. It cannot redirect value to a third party, and it cannot touch
 * the depositor's output. For the VP commission the value cap
 * (`floor(peginValue × commissionBps / 10_000)`) still bounds depositor
 * exposure independently of where the commission goes. The BIP-86 branch is
 * also precisely what every pre-RFC-006 client pinned, so this is the older
 * rule retained alongside the newer one, not a laxer rule invented for it.
 *
 * ## When this can be removed
 *
 * This validation runs at one point in the lifecycle: depositor payout signing
 * (`PENDING` → `VERIFIED`). It is not re-run on refund or withdrawal. So the
 * BIP-86 branch stops being reachable for a network once every vault
 * registered before that network's #2440 upgrade has left
 * `PendingDepositorSignatures` — signed and activated, or expired past its
 * activation deadline. That is bounded by the vault lifetime, not indefinite.
 *
 * Removal is therefore gated by the **last** network to upgrade, since this
 * code is shared. Concretely: drop the BIP-86 branch only once devnet, testnet
 * and mainnet have all been on #2440 for longer than the activation deadline,
 * and no vault registered before those upgrades is still awaiting signatures.
 * Deleting it earlier strands deposits with BTC already locked; there is no
 * recovery path short of the refund timelock.
 *
 * @internal Helper invoked by {@link assertPayoutOutputLayout}.
 */
function acceptedPayoutScriptHexes(
  registeredScriptPubKey: string,
  bondedPubkey: string,
): string[] {
  const registered = stripHexPrefix(registeredScriptPubKey).toLowerCase();
  const legacyBip86 = stripHexPrefix(
    deriveBip86ScriptPubKeyHex(bondedPubkey),
  ).toLowerCase();
  return registered === legacyBip86 ? [registered] : [registered, legacyBip86];
}

/** Whether `script` matches any of `acceptedHexes`. */
function matchesAnyScript(script: Buffer, acceptedHexes: string[]): boolean {
  return acceptedHexes.some((hex) => script.equals(Buffer.from(hex, "hex")));
}

/**
 * Validate a payout transaction's output structure for the claimer's role,
 * keyed on `claimerBtcPubkey`. Pins per role: `outs.length`, `outs[0].script`,
 * `outs[last].value` (anchor dust), and — for the VP-claimer —
 * `outs[1].script` plus `outs[1].value`, capped at
 * `floor(peginValue × commissionBps / 10_000)`. Canonical layouts: VP-claimer
 * = [payout, commission, anchor]; depositor/VK-claimer = [payout, anchor].
 *
 * `outs[last].script` (the CPFP anchor) is intentionally not pinned: the value
 * pin above bounds depositor exposure regardless of where that dust goes.
 *
 * `outs[1].script` (the VP commission) was unpinned for the same reason.
 * RFC-006 supersedes that rationale: the commission destination is now an
 * operator-registered scriptPubKey we resolve independently at the vault's
 * frozen `vpKeyEpoch`, so it is pinned too — `vpCommissionScriptPubKey` is a
 * required parameter, so there is no unpinned case. The value cap stays — it is
 * still what bounds exposure — and the script pin is added precision, not a
 * replacement for it.
 *
 * What counts as a match differs by output.
 * {@link acceptedPayoutScriptHexes} accepts two candidates — the registered
 * scriptPubKey and the BIP-86 derivation over the bonded key, the latter as a
 * transitional allowance — and backs the VK-claimer's `outs[0]` and the VP
 * commission `outs[1]`. The VP-claimer and depositor-as-claimer `outs[0]` is
 * pinned to the registered payout script alone.
 *
 * Returns the layout-trusted non-anchor script lengths for the fee band:
 * `out0Len` from the pinned `outs[0]` script, and `out1Len` from the pinned
 * VP-claimer commission output, `undefined` for the other roles. Only
 * `out0Len` is range-checked, against the contract's registration cap
 * `[1, MAX_PAYOUT_SCRIPT_LEN]`; `outs[1]` carries no length cap of its own
 * because `assertStandardPayoutScript` already bounds it to a standard output
 * type, which makes the cap unreachable.
 *
 * @internal Helper invoked by {@link buildPayoutPsbt}.
 */
function assertPayoutOutputLayout(
  payoutTx: Transaction,
  peginValueSats: number,
  params: PayoutParams,
): { out0Len: number; out1Len: number | undefined } {
  const {
    claimerBtcPubkey,
    vaultProviderBtcPubkey,
    depositorBtcPubkey,
    vaultKeeperBtcPubkeys,
    registeredPayoutScriptPubKey,
    commissionBps,
    vkClaimerPayoutScriptPubKeys,
    vpCommissionScriptPubKey,
  } = params;

  if (!isValidHex(registeredPayoutScriptPubKey)) {
    throw new Error("Invalid registeredPayoutScriptPubKey: not valid hex");
  }

  const claimer = stripHexPrefix(claimerBtcPubkey).toLowerCase();
  const vp = stripHexPrefix(vaultProviderBtcPubkey).toLowerCase();
  const dep = stripHexPrefix(depositorBtcPubkey).toLowerCase();
  const keepers = vaultKeeperBtcPubkeys.map((k) =>
    stripHexPrefix(k).toLowerCase(),
  );

  type Role = "vp-claimer" | "depositor-as-claimer" | "vk-claimer";
  let role: Role;
  let expectedOutCount: number;
  let acceptedOut0ScriptHexes: string[];

  if (claimer === vp) {
    role = "vp-claimer";
    expectedOutCount = VP_CLAIMER_PAYOUT_OUTPUT_COUNT;
    acceptedOut0ScriptHexes = [stripHexPrefix(registeredPayoutScriptPubKey)];
  } else if (claimer === dep) {
    role = "depositor-as-claimer";
    expectedOutCount = NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT;
    acceptedOut0ScriptHexes = [stripHexPrefix(registeredPayoutScriptPubKey)];
  } else if (keepers.includes(claimer)) {
    role = "vk-claimer";
    expectedOutCount = NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT;
    // RFC-006: a keeper's payout goes to the scriptPubKey it registered
    // on-chain, resolved at the vault's frozen keeper epoch. Deriving BIP-86
    // locally as the sole expectation would reject a valid payout the moment a
    // keeper points its payouts at cold custody.
    //
    // A missing entry is an error, never a BIP-86 fallback: the registry
    // backfills BIP-86 itself for keepers that never registered a script, so a
    // gap here means the resolution was incomplete, not that this keeper is on
    // the default.
    const registered = vkClaimerPayoutScriptPubKeys[claimer];
    if (registered === undefined) {
      throw new Error(
        `No registered payout script resolved for vault keeper claimer ${claimer}`,
      );
    }
    assertStandardPayoutScript(
      registered,
      `Vault keeper payout script for claimer ${claimer}`,
    );
    acceptedOut0ScriptHexes = acceptedPayoutScriptHexes(registered, claimer);
  } else {
    throw new Error(
      `Unknown claimer pubkey ${claimer}: not VP, depositor, or a registered vault keeper`,
    );
  }

  if (payoutTx.outs.length !== expectedOutCount) {
    throw new Error(
      `Payout transaction has ${payoutTx.outs.length} output(s), ` +
        `expected exactly ${expectedOutCount} for role ${role}.`,
    );
  }

  if (!matchesAnyScript(payoutTx.outs[0].script, acceptedOut0ScriptHexes)) {
    throw new Error(
      `Payout transaction output 0 does not pay the expected scriptPubKey for role ${role}. ` +
        `Accepted: ${acceptedOut0ScriptHexes.join(" or ")}; ` +
        `got ${payoutTx.outs[0].script.toString("hex")}`,
    );
  }

  const anchorIdx = expectedOutCount - 1;
  if (payoutTx.outs[anchorIdx].value !== PAYOUT_ANCHOR_DUST_SATS) {
    throw new Error(
      `Payout CPFP anchor (out ${anchorIdx}) value ${payoutTx.outs[anchorIdx].value} sats ` +
        `must equal ${PAYOUT_ANCHOR_DUST_SATS} sats`,
    );
  }

  if (role === "vp-claimer") {
    // RFC-006 commission destination. Checked before the value cap so a
    // substituted destination reports as such rather than surfacing later as a
    // confusing amount error.
    assertStandardPayoutScript(
      vpCommissionScriptPubKey,
      "Vault provider commission payout script",
    );
    const acceptedCommissionScriptHexes = acceptedPayoutScriptHexes(
      vpCommissionScriptPubKey,
      vp,
    );
    if (
      !matchesAnyScript(payoutTx.outs[1].script, acceptedCommissionScriptHexes)
    ) {
      throw new Error(
        `Payout transaction output 1 does not pay the vault provider's commission scriptPubKey. ` +
          `Accepted: ${acceptedCommissionScriptHexes.join(" or ")}; ` +
          `got ${payoutTx.outs[1].script.toString("hex")}`,
      );
    }

    // Structural guard only — a non-negative integer below the bps
    // denominator, so the cap math `floor(peginValue * bps / 10_000)` is
    // meaningful. The protocol minimum is enforced at the trust boundary
    // (`prepareSigningContext`); a too-low value here is fail-safe.
    if (
      !Number.isInteger(commissionBps) ||
      commissionBps < 0 ||
      commissionBps >= MAX_VP_COMMISSION_BPS_EXCLUSIVE
    ) {
      throw new Error(
        `commissionBps must be an integer in ` +
          `[0, ${MAX_VP_COMMISSION_BPS_EXCLUSIVE}), got ${commissionBps}`,
      );
    }
    const maxCommissionSats = Math.floor(
      (peginValueSats * commissionBps) / BPS_DENOMINATOR,
    );
    if (payoutTx.outs[1].value > maxCommissionSats) {
      throw new Error(
        `Payout VP commission (out 1) value ${payoutTx.outs[1].value} sats ` +
          `exceeds cap ${maxCommissionSats} sats ` +
          `(${commissionBps} bps of peginValue=${peginValueSats})`,
      );
    }
  }

  // The accepted-script set can hold more than one candidate (dual-accept), so
  // the length the fee band consumes is that of the output actually present —
  // which the check above has already pinned to one of the accepted values.
  const out0Len = payoutTx.outs[0].script.length;
  if (out0Len === 0 || out0Len > MAX_PAYOUT_SCRIPT_LEN) {
    throw new Error(
      `Payout receiver scriptPubKey length ${out0Len} is outside the ` +
        `contract's registration cap [1, ${MAX_PAYOUT_SCRIPT_LEN}]; ` +
        `refusing to sign payout.`,
    );
  }
  // No length cap on outs[1]: under RFC-006 the commission output is pinned to
  // the operator's registered script, and `assertStandardPayoutScript` above
  // already bounds that to a standard type (34 bytes at most). A separate
  // 128-byte cap here would be unreachable. Still measured, because the fee
  // floor consumes it — and now from a pinned source rather than a
  // VP-controlled one.
  const out1Len =
    role === "vp-claimer" ? payoutTx.outs[1].script.length : undefined;

  return { out0Len, out1Len };
}

/**
 * Extract Schnorr signature from signed payout PSBT.
 *
 * This function supports two cases:
 * 1. Non-finalized PSBT: Extracts from tapScriptSig field
 * 2. Finalized PSBT: Extracts from witness data
 *
 * The signature is returned as a 64-byte hex string (128 hex characters).
 * Payout signatures must use implicit Taproot SIGHASH_DEFAULT, which is
 * encoded by omitting the sighash byte.
 *
 * @param signedPsbtHex - Signed PSBT hex
 * @param depositorPubkey - Depositor's public key (x-only, 64-char hex)
 * @param inputIndex - Input index to extract signature from (default: 0)
 * @returns 64-byte Schnorr signature (128 hex characters, no sighash flag)
 *
 * @throws If no signature is found in the PSBT
 * @throws If the signature has an unexpected length
 */
export function extractPayoutSignature(
  signedPsbtHex: string,
  depositorPubkey: string,
  inputIndex = 0,
): string {
  const signedPsbt = Psbt.fromHex(signedPsbtHex);

  if (inputIndex >= signedPsbt.data.inputs.length) {
    throw new Error(
      `Input index ${inputIndex} out of range (${signedPsbt.data.inputs.length} inputs)`,
    );
  }

  const input = signedPsbt.data.inputs[inputIndex];

  // Case 1: Non-finalized PSBT — extract from tapScriptSig
  if (input.tapScriptSig && input.tapScriptSig.length > 0) {
    const depositorPubkeyBytes = hexToUint8Array(depositorPubkey);

    for (const sigEntry of input.tapScriptSig) {
      if (sigEntry.pubkey.equals(Buffer.from(depositorPubkeyBytes))) {
        return extractSchnorrSig(sigEntry.signature, inputIndex);
      }
    }

    throw new Error(
      `No signature found for depositor pubkey: ${depositorPubkey} at input ${inputIndex}`,
    );
  }

  // Case 2: Finalized PSBT — extract from finalScriptWitness
  // Taproot single-signature script-path witness: [signature, script, controlBlock].
  // Enforce the exact stack size so that if a wallet produces an unexpected
  // finalization (e.g. a multi-signature stack, an annex, or malformed data),
  // we fail loudly instead of silently returning witnessStack[0] which may
  // not be the depositor's signature.
  if (input.finalScriptWitness && input.finalScriptWitness.length > 0) {
    const witnessStack = parseWitnessStack(input.finalScriptWitness);
    if (witnessStack.length !== TAPROOT_SINGLE_SIG_WITNESS_STACK_SIZE) {
      throw new Error(
        `Unexpected finalized witness stack size at input ${inputIndex}: ` +
          `expected ${TAPROOT_SINGLE_SIG_WITNESS_STACK_SIZE} items (signature, script, controlBlock), ` +
          `got ${witnessStack.length}`,
      );
    }
    return extractSchnorrSig(witnessStack[0], inputIndex);
  }

  throw new Error(
    `No tapScriptSig or finalScriptWitness found in signed PSBT at input ${inputIndex}`,
  );
}

/**
 * Extract and validate a 64-byte Schnorr signature.
 * Rejects 65-byte signatures because the appended sighash byte changes the
 * Taproot message being signed; stripping it would produce an unverifiable
 * SIGHASH_DEFAULT signature.
 * @internal
 */
function extractSchnorrSig(sig: Uint8Array, inputIndex: number): string {
  if (sig.length === 64) {
    return uint8ArrayToHex(new Uint8Array(sig));
  }
  if (sig.length === 65) {
    throw new Error(
      `Unexpected sighash byte 0x${sig[64].toString(16).padStart(2, "0")} at input ${inputIndex}. ` +
        "Expected implicit SIGHASH_DEFAULT as a 64-byte signature.",
    );
  }
  throw new Error(
    `Unexpected signature length at input ${inputIndex}: ${sig.length}`,
  );
}

/**
 * Parse a BIP-141 serialized witness stack into individual stack items.
 * Format: [varint item_count] [varint len, data]...
 *
 * Throws on malformed input (truncated buffer, 8-byte varints, or trailing
 * bytes) so callers never receive silently-corrupted witness items.
 * @internal
 */
function parseWitnessStack(witness: Buffer): Buffer[] {
  const items: Buffer[] = [];
  let offset = 0;

  const requireBytes = (n: number): void => {
    if (offset + n > witness.length) {
      throw new Error(
        `Malformed witness data: need ${n} byte(s) at offset ${offset}, only ${witness.length - offset} remaining`,
      );
    }
  };

  const readVarInt = (): number => {
    requireBytes(1);
    const first = witness[offset++];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      requireBytes(2);
      const val = (witness[offset] | (witness[offset + 1] << 8)) >>> 0;
      offset += 2;
      return val;
    }
    if (first === 0xfe) {
      requireBytes(4);
      const val =
        (witness[offset] |
          (witness[offset + 1] << 8) |
          (witness[offset + 2] << 16) |
          (witness[offset + 3] << 24)) >>>
        0;
      offset += 4;
      return val;
    }
    // 0xff — 8-byte varint. Not used for witness sizes in practice and JS
    // numbers cannot represent all 64-bit values exactly, so reject rather
    // than risk silent truncation.
    throw new Error(
      `Malformed witness data: 8-byte varint (0xff) not supported at offset ${offset - 1}`,
    );
  };

  const count = readVarInt();
  for (let i = 0; i < count; i++) {
    const len = readVarInt();
    requireBytes(len);
    items.push(Buffer.from(witness.subarray(offset, offset + len)));
    offset += len;
  }

  if (offset !== witness.length) {
    throw new Error(
      `Malformed witness data: ${witness.length - offset} trailing byte(s) after parsing ${count} item(s)`,
    );
  }

  return items;
}
