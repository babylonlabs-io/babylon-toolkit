/**
 * Depositor Graph Signing Service
 *
 * Signs the depositor's own graph transactions (Payout, NoPayout per challenger)
 * for the depositor-as-claimer flow.
 *
 * Both PSBTs are constructed locally from authoritative on-chain connector
 * parameters and the VP-advertised transaction hexes (which are themselves
 * cross-checked against on-chain or protocol-defined sinks). Building PSBTs
 * locally is essential: every field that enters the Taproot sighash
 * (witnessUtxo, tapLeafScript, controlBlock, tapInternalKey) must come from
 * trusted sources, otherwise a malicious VP could substitute metadata that
 * makes the depositor's signature valid for a different spend.
 *
 * Transaction counts: 1 Payout + N NoPayout = 1 + N total PSBTs.
 *
 * @see btc-vault docs/pegin.md - "Automatic Graph Creation & Presigning"
 * @see btc-vault crates/vault/src/transactions/nopayout.rs - NoPayout structure
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Transaction } from "bitcoinjs-lib";

import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "../../../../shared/wallets/interfaces";
import type {
  DepositorAsClaimerPresignatures,
  DepositorGraphTransactions,
  DepositorPreSigsPerChallenger,
  PresignDataPerChallenger,
} from "../../clients/vault-provider/types";
import { signPsbtsWithFallback } from "../../managers/pegin/signPsbtsWithFallback";
import { deriveLocalChallengers } from "../../primitives/challengers";
import {
  assertPsbtUnsignedTxMatches,
  type AssertPsbtUnsignedTxMatchesParams,
} from "../../primitives/psbt/assertPsbtUnsignedTxMatches";
import { assertChallengeAssertIsCanonical } from "../../primitives/psbt/challengeAssert";
import {
  ASSERT_MARKER_OUTPUT_COUNT,
  ASSERT_NON_CHALLENGER_OUTPUT_COUNT,
  ASSERT_PAYOUT_OUTPUT_INDEX,
  CHALLENGE_ASSERT_CONNECTORS_PER_CHALLENGER,
  CHALLENGE_ASSERT_OUTPUT_CONNECTOR_INDEX,
  DEPOSITOR_SIGNED_INPUT_COUNT,
} from "../../primitives/psbt/constants";
import {
  assertCanonicalNoPayoutShape,
  assertNoPayoutOutputMatchesChallenger,
  buildNoPayoutPsbt,
} from "../../primitives/psbt/noPayout";
import {
  buildPayoutPsbt,
  extractPayoutSignature,
} from "../../primitives/psbt/payout";
import { assertScriptPathSchnorrSignature } from "../../primitives/psbt/verifyScriptPathSchnorrSignature";
import {
  getSortedXOnlyPubkeys,
  stripHexPrefix,
  uint8ArrayToHex,
  validateWalletPubkey,
} from "../../primitives/utils/bitcoin";
import { createTaprootScriptPathSignOptions } from "../../utils/signing";
import { getChallengeAssertOutputScriptPubKey } from "../../wasm";
import { assertPresignClaimAssertLinkage } from "./graphFingerprint";

/**
 * commissionBps placeholder for the depositor-as-claimer path — `buildPayoutPsbt`
 * only consults it under the VP-claimer role, so any in-range value is inert.
 */
const DEPOSITOR_PATH_UNUSED_COMMISSION_BPS = 1;

/** Tracks which indices in the flat PSBT array belong to which challenger */
interface ChallengerEntry {
  challengerPubkey: string;
  noPayoutIdx: number;
}

/** Result of the collect phase - flat PSBT array with index mapping */
interface CollectedDepositorGraphPsbts {
  psbtHexes: string[];
  signOptions: SignPsbtOptions[];
  challengerEntries: ChallengerEntry[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Reject VP-supplied `challenger_presign_data` whose pubkey set does not
 * exactly equal `localChallengers ∪ universalChallengers`, and return that
 * set in the protocol's challenger order.
 *
 * The daemon's `challenger_presign_data` contains one entry per challenger
 * in `local ∪ universal`; for the depositor-as-claimer flow this is
 * `VKs ∪ UCs`. Its array order is not meaningful (the daemon iterates a map).
 * The order that matters is btc-vault `Challengers::all_sorted()`
 * (`crates/vault/src/lib.rs:596-601` @ b534ff9e): one sort over local and
 * universal together by x-only key bytes, which is lowercase-hex order. A
 * challenger's position in it fixes which Assert outputs its ChallengeAsserts
 * spend.
 *
 * Threat model: a malicious or buggy VP could omit, duplicate, or inject
 * unrelated entries. Missing entries → depositor activates with incomplete
 * recovery material (omitted challenger later becomes unenforceable).
 * Duplicates or extras → wallet signs PSBTs for challengers the protocol
 * doesn't recognize, handing the VP signatures it shouldn't have.
 *
 * @returns Every challenger key (lowercase x-only hex) in `all_sorted()` order
 */
function assertChallengerSetMatchesExpected(
  challengerPresignData: PresignDataPerChallenger[],
  localChallengers: string[],
  universalChallengerBtcPubkeys: string[],
): string[] {
  const universal = universalChallengerBtcPubkeys.map((k) =>
    stripHexPrefix(k).toLowerCase(),
  );
  // Protocol guarantee: local and universal sets are disjoint. Reject
  // overlap so the depositor doesn't sign for an ambiguous challenger role.
  const overlap = localChallengers.filter((k) => universal.includes(k));
  if (overlap.length > 0) {
    throw new Error(
      `Cannot validate challenger set: vault keepers and universal challengers overlap (${overlap.join(", ")})`,
    );
  }
  const expected = [...localChallengers, ...universal];

  const suppliedList = challengerPresignData.map((c) =>
    stripHexPrefix(c.challenger_pubkey).toLowerCase(),
  );
  const suppliedSet = new Set(suppliedList);
  if (suppliedSet.size !== suppliedList.length) {
    throw new Error(
      "Depositor graph contains duplicate challenger entries in challenger_presign_data",
    );
  }
  const expectedSet = new Set(expected);
  const missing = expected.filter((c) => !suppliedSet.has(c));
  const extra = suppliedList.filter((c) => !expectedSet.has(c));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Depositor graph challenger set does not match expected (local ∪ universal)` +
        (missing.length > 0 ? ` (missing: ${missing.join(", ")})` : "") +
        (extra.length > 0 ? ` (unexpected: ${extra.join(", ")})` : ""),
    );
  }
  return getSortedXOnlyPubkeys(expected);
}

/**
 * Require the Assert to carry exactly one ConnectorX and one ConnectorY per
 * challenger, around output 0, the RFC-008 marker and the CPFP anchor. The
 * ChallengeAssert vouts are derived from the challenger count, so an Assert
 * built for a different count would shift which connector each
 * ChallengeAssert spends.
 */
function assertAssertChallengerOutputCount(
  assertTx: Transaction,
  challengerCount: number,
): void {
  const expected =
    ASSERT_NON_CHALLENGER_OUTPUT_COUNT +
    CHALLENGE_ASSERT_CONNECTORS_PER_CHALLENGER * challengerCount +
    ASSERT_MARKER_OUTPUT_COUNT;
  if (assertTx.outs.length !== expected) {
    throw new Error(
      `Assert must have ${expected} outputs for ${challengerCount} challengers, ` +
        `got ${assertTx.outs.length}`,
    );
  }
}

// ============================================================================
// NoPayout checks
// ============================================================================

/** One challenger's NoPayout, checked against its canonical parents. */
export interface CheckedNoPayout {
  /** The challenger's entry in the VP response */
  challenger: PresignDataPerChallenger;
  /** The challenger's x-only key (hex, no 0x prefix) */
  challengerPubkey: string;
  /** Assert:0, ChallengeAssertX:0 and ChallengeAssertY:0, in NoPayout input order */
  prevouts: Array<{ script_pubkey: string; value: number }>;
}

/** The NoPayout side of a depositor graph, checked and ready to build. */
export interface CheckedDepositorGraphNoPayouts {
  /** The depositor-as-claimer's local challengers, derived from the context */
  localChallengers: string[];
  /** One entry per challenger, in the VP's order */
  noPayouts: CheckedNoPayout[];
}

/**
 * Check everything on the NoPayout side of the depositor graph that needs no
 * wallet: the challenger set equals `local ∪ universal`, the Assert carries
 * one ConnectorX and one ConnectorY per challenger, and for every challenger
 * the ChallengeAssertX/Y are the canonical transactions for this Assert, the
 * NoPayout spends exactly them with the canonical sequences, and it pays the
 * challenger's BIP-86 key.
 *
 * `runDepositorPresignFlow` calls this before the deposit-terms approval and
 * every payout signing prompt. `signDepositorGraph` calls it again because it
 * is also a public entry point.
 *
 * @param depositorGraph - The depositor graph from the VP response
 * @param ctx - Authoritative inputs the graph is checked against
 * @returns The checked per-challenger data the NoPayout PSBTs are built from
 * @throws If any check fails
 */
export async function assertDepositorGraphNoPayoutsCanonical(
  depositorGraph: DepositorGraphTransactions,
  ctx: DepositorGraphSigningContext,
): Promise<CheckedDepositorGraphNoPayouts> {
  const localChallengers = deriveLocalChallengers({
    claimerBtcPubkey: ctx.depositorBtcPubkey,
    depositorBtcPubkey: ctx.depositorBtcPubkey,
    vaultProviderBtcPubkey: ctx.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: ctx.vaultKeeperBtcPubkeys,
  });
  const sortedChallengers = assertChallengerSetMatchesExpected(
    depositorGraph.challenger_presign_data,
    localChallengers,
    ctx.universalChallengerBtcPubkeys,
  );

  const claimerPubkey = stripHexPrefix(ctx.depositorBtcPubkey);
  const assertTx = Transaction.fromHex(
    stripHexPrefix(depositorGraph.assert_tx.tx_hex),
  );
  assertAssertChallengerOutputCount(assertTx, sortedChallengers.length);

  const noPayouts: CheckedNoPayout[] = [];
  for (const challenger of depositorGraph.challenger_presign_data) {
    const challengerPubkey = stripHexPrefix(challenger.challenger_pubkey);
    // The set check above guarantees membership.
    const challengerIndex = sortedChallengers.indexOf(
      challengerPubkey.toLowerCase(),
    );
    const prevouts = await assertNoPayoutParentsCanonical({
      challenger,
      challengerPubkey,
      challengerIndex,
      challengerCount: sortedChallengers.length,
      claimerPubkey,
      assertTx,
      ctx,
    });
    noPayouts.push({ challenger, challengerPubkey, prevouts });
  }

  return { localChallengers, noPayouts };
}

interface AssertNoPayoutParentsCanonicalParams {
  challenger: PresignDataPerChallenger;
  challengerPubkey: string;
  /** Position of the challenger in `Challengers::all_sorted()` order */
  challengerIndex: number;
  /** Number of local plus universal challengers */
  challengerCount: number;
  claimerPubkey: string;
  assertTx: Transaction;
  ctx: DepositorGraphSigningContext;
}

/**
 * Check one challenger's NoPayout and its two ChallengeAssert parents against
 * the authoritative Assert, and return the NoPayout's prevouts taken from
 * those canonical parents.
 *
 * NoPayout transaction layout (per
 * btc-vault crates/vault/src/transactions/nopayout.rs):
 * - 3 inputs (fixed order):
 *   - Input 0: Assert tx output 0 (depositor signs - NoPayout path)
 *   - Input 1: ChallengeAssertX tx output 0 (with timelock)
 *   - Input 2: ChallengeAssertY tx output 0 (with timelock)
 * - 1 output: BIP-86 P2TR to the challenger
 */
async function assertNoPayoutParentsCanonical(
  params: AssertNoPayoutParentsCanonicalParams,
): Promise<CheckedNoPayout["prevouts"]> {
  const {
    challenger,
    challengerPubkey,
    challengerIndex,
    challengerCount,
    claimerPubkey,
    assertTx,
    ctx,
  } = params;

  // Pin the output sink before doing any sighash-relevant work.
  assertNoPayoutOutputMatchesChallenger(
    challenger.nopayout_tx.tx_hex,
    challengerPubkey,
    ctx.network,
  );

  // Parse the NoPayout tx and the two ChallengeAssert parents.
  const noPayoutTx = Transaction.fromHex(
    stripHexPrefix(challenger.nopayout_tx.tx_hex),
  );
  const challengeAssertXTx = Transaction.fromHex(
    stripHexPrefix(challenger.challenge_assert_x_tx.tx_hex),
  );
  const challengeAssertYTx = Transaction.fromHex(
    stripHexPrefix(challenger.challenge_assert_y_tx.tx_hex),
  );

  // The depositor's signature commits to both parents' txids, and that
  // commitment is the only constraint on them: the protocol takes no claimer
  // signature on ChallengeAssert. So each parent must be exactly the
  // transaction btc-vault builds from this Assert, paying the timelocked
  // connector — otherwise a colluding challenger could spend Assert:0 through
  // NoPayout without a dispute. The label hashes are the VP's, and are bound
  // to this vault only by the presign fingerprint checked at activation. The
  // response validator accepts either hex case and the fingerprint lowercases
  // them, so they are lowercased here too: the same bytes, in the only case
  // the connector accepts.
  const outputConnectorScriptPubKey =
    await getChallengeAssertOutputScriptPubKey({
      txGraphVersion: ctx.vaultCoreVersion,
      claimer: claimerPubkey,
      challenger: challengerPubkey,
      timelockChallengeAssert: ctx.timelockChallengeAssert,
      outputLabelHashes: challenger.output_label_hashes.map((hash) =>
        hash.toLowerCase(),
      ),
      network: ctx.network,
    });
  for (const [half, challengeAssertTx] of [
    ["X", challengeAssertXTx],
    ["Y", challengeAssertYTx],
  ] as const) {
    assertChallengeAssertIsCanonical({
      challengeAssertTx,
      assertTx,
      half,
      challengerIndex,
      challengerCount,
      challengerPubkey,
      outputConnectorScriptPubKey,
    });
  }

  const parentOutputs = [
    assertTx.outs[ASSERT_PAYOUT_OUTPUT_INDEX],
    challengeAssertXTx.outs[CHALLENGE_ASSERT_OUTPUT_CONNECTOR_INDEX],
    challengeAssertYTx.outs[CHALLENGE_ASSERT_OUTPUT_CONNECTOR_INDEX],
  ] as const;
  assertCanonicalNoPayoutShape({
    noPayoutTx,
    assertTxid: assertTx.getId(),
    challengeAssertXTxid: challengeAssertXTx.getId(),
    challengeAssertYTxid: challengeAssertYTx.getId(),
    timelockChallengeAssert: ctx.timelockChallengeAssert,
    prevoutValues: [
      parentOutputs[0].value,
      parentOutputs[1].value,
      parentOutputs[2].value,
    ],
  });

  return parentOutputs.map((out) => ({
    script_pubkey: uint8ArrayToHex(new Uint8Array(out.script)),
    value: out.value,
  }));
}

// ============================================================================
// Collect phase
// ============================================================================

/**
 * Build the depositor's payout PSBT and per-challenger NoPayout PSBTs locally
 * from authoritative connector params.
 *
 * Layout of returned arrays: [Payout, NoPayout_0, NoPayout_1, ...]
 */
async function collectDepositorGraphPsbts(
  depositorGraph: DepositorGraphTransactions,
  walletPublicKey: string,
  ctx: DepositorGraphSigningContext,
): Promise<CollectedDepositorGraphPsbts> {
  const psbtHexes: string[] = [];
  const signOptions: SignPsbtOptions[] = [];
  const challengerEntries: ChallengerEntry[] = [];

  // 1. Fail-fast on a malformed VP response BEFORE doing any PSBT-build
  //    work that would be wasted if the challenger set or a NoPayout's
  //    parents are wrong.
  const { localChallengers, noPayouts } =
    await assertDepositorGraphNoPayoutsCanonical(depositorGraph, ctx);

  // 2. Build the payout PSBT locally — every sighash-relevant field is
  //    derived from trusted on-chain connector params, not from the VP.
  //    buildPayoutPsbt also runs the per-role output validation.
  const builtPayout = await buildPayoutPsbt({
    vaultCoreVersion: ctx.vaultCoreVersion,
    vkClaimerPayoutScriptPubKeys: ctx.vkClaimerPayoutScriptPubKeys,
    vpCommissionScriptPubKey: ctx.vpCommissionScriptPubKey,
    payoutTxHex: depositorGraph.payout_tx.tx_hex,
    peginTxHex: ctx.peginTxHex,
    assertTxHex: depositorGraph.assert_tx.tx_hex,
    timelockAssert: ctx.timelockAssert,
    depositorBtcPubkey: ctx.depositorBtcPubkey,
    vaultProviderBtcPubkey: ctx.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: ctx.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: ctx.universalChallengerBtcPubkeys,
    timelockPegin: ctx.timelockPegin,
    network: ctx.network,
    claimerBtcPubkey: ctx.depositorBtcPubkey,
    registeredPayoutScriptPubKey: ctx.registeredPayoutScriptPubKey,
    commissionBps: DEPOSITOR_PATH_UNUSED_COMMISSION_BPS,
    protocolFeeRate: ctx.protocolFeeRate,
    councilMembers: ctx.councilMembers,
    councilQuorum: ctx.councilQuorum,
  });
  psbtHexes.push(builtPayout.psbtHex);
  signOptions.push(
    createTaprootScriptPathSignOptions(
      walletPublicKey,
      DEPOSITOR_SIGNED_INPUT_COUNT,
    ),
  );

  // 3. Per-challenger: build the NoPayout PSBT locally too, over the
  //    canonical parents checked in step 1.
  const claimerPubkey = stripHexPrefix(ctx.depositorBtcPubkey);
  for (const { challenger, challengerPubkey, prevouts } of noPayouts) {
    const noPayoutIdx = psbtHexes.length;
    const noPayoutHex = await buildNoPayoutPsbt({
      noPayoutTxHex: challenger.nopayout_tx.tx_hex,
      challengerPubkey,
      prevouts,
      connectorParams: {
        txGraphVersion: ctx.vaultCoreVersion,
        claimer: claimerPubkey,
        localChallengers,
        universalChallengers: ctx.universalChallengerBtcPubkeys,
        timelockAssert: ctx.timelockAssert,
        councilMembers: ctx.councilMembers,
        councilQuorum: ctx.councilQuorum,
      },
    });
    psbtHexes.push(noPayoutHex);
    signOptions.push(
      createTaprootScriptPathSignOptions(
        walletPublicKey,
        DEPOSITOR_SIGNED_INPUT_COUNT,
      ),
    );

    challengerEntries.push({
      challengerPubkey,
      noPayoutIdx,
    });
  }

  return { psbtHexes, signOptions, challengerEntries };
}

// ============================================================================
// Extract phase
// ============================================================================

/** A pair of a locally-built PSBT and the wallet-returned PSBT for it. */
type PsbtPair = AssertPsbtUnsignedTxMatchesParams;

/**
 * Extract all signatures from signed PSBTs and assemble into presignatures.
 * Each pair is asserted to encode the same unsigned tx before its signature
 * is extracted — defends against a wallet that returns a signature for a
 * substituted transaction.
 */
function extractDepositorGraphSignatures(
  psbtPairs: PsbtPair[],
  challengerEntries: ChallengerEntry[],
  depositorPubkey: string,
): DepositorAsClaimerPresignatures {
  // Positional invariant: psbtPairs[0] is the payout PSBT; per-challenger
  // nopayouts live at indices recorded in `challengerEntries[].noPayoutIdx`.
  // Set up by `collectDepositorGraphPsbts` (payout pushed first, then each
  // nopayout). A future refactor that reorders the array would silently
  // extract the wrong signature for the wrong slot — Critical Path #3.
  // Payout and every NoPayout PSBT are signed on input 0 (depositor script-path).
  const DEPOSITOR_SIGNED_INPUT_INDEX = 0;

  assertPsbtUnsignedTxMatches(psbtPairs[0]);
  const payoutSignature = extractPayoutSignature(
    psbtPairs[0].returnedPsbtHex,
    depositorPubkey,
  );
  // Critical Path #7: verify the wallet's signature against a sighash recomputed
  // from the PSBT we built (psbtPairs[0].requestedPsbtHex), not the returned one.
  assertScriptPathSchnorrSignature({
    requestedPsbtHex: psbtPairs[0].requestedPsbtHex,
    signatureHex: payoutSignature,
    signerXOnlyPubkeyHex: depositorPubkey,
    inputIndex: DEPOSITOR_SIGNED_INPUT_INDEX,
  });

  const perChallenger: Record<string, DepositorPreSigsPerChallenger> = {};
  for (const entry of challengerEntries) {
    assertPsbtUnsignedTxMatches(psbtPairs[entry.noPayoutIdx]);
    const nopayoutSignature = extractPayoutSignature(
      psbtPairs[entry.noPayoutIdx].returnedPsbtHex,
      depositorPubkey,
    );
    assertScriptPathSchnorrSignature({
      requestedPsbtHex: psbtPairs[entry.noPayoutIdx].requestedPsbtHex,
      signatureHex: nopayoutSignature,
      signerXOnlyPubkeyHex: depositorPubkey,
      inputIndex: DEPOSITOR_SIGNED_INPUT_INDEX,
    });
    perChallenger[entry.challengerPubkey] = {
      nopayout_signature: nopayoutSignature,
    };
  }

  return {
    payout_signatures: {
      payout_signature: payoutSignature,
    },
    per_challenger: perChallenger,
  };
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Authoritative inputs required to construct the depositor's Payout AND every
 * per-challenger NoPayout PSBT locally. Every field here must come from
 * trusted on-chain sources, not from the vault provider response. They feed
 * directly into the Taproot sighash.
 */
export interface DepositorGraphSigningContext {
  /**
   * Vault core (tx-graph) version the vault was registered under — the
   * vault's stamped on-chain `vaultCoreVersion` from `BTCVaultRegistry`.
   * Selects which graph's connector scripts every PSBT is rebuilt with.
   */
  vaultCoreVersion: number;
  /** Raw pegin BTC transaction hex (provides the depositor's signed prevout) */
  peginTxHex: string;
  /** Depositor's BTC public key (x-only, 64-char hex, no 0x prefix) */
  depositorBtcPubkey: string;
  /** Vault provider's BTC public key (x-only hex, no prefix) */
  vaultProviderBtcPubkey: string;
  /** Sorted vault keeper BTC public keys (x-only hex, no prefix) */
  vaultKeeperBtcPubkeys: string[];
  /** Sorted universal challenger BTC public keys (x-only hex, no prefix) */
  universalChallengerBtcPubkeys: string[];
  /** Pegin CSV timelock from the locked offchain params version (blocks) */
  timelockPegin: number;
  /**
   * Tx-graph fee rate (sat/vB) from the locked offchain params version —
   * bounds the depositor-claimer payout's implicit fee (payout fee band).
   */
  protocolFeeRate: bigint;
  /**
   * Assert CSV timelock from the locked offchain params version (blocks).
   * Sourced from the on-chain ProtocolParams contract via
   * `ViemProtocolParamsReader.getOffchainParamsByVersion(...).timelockAssert`.
   */
  timelockAssert: number;
  /**
   * ChallengeAssert CSV timelock from the locked offchain params version
   * (blocks). Sourced from the on-chain ProtocolParams contract via
   * `ViemProtocolParamsReader.getOffchainParamsByVersion(...).timelockChallengeAssert`.
   * Each NoPayout's ChallengeAssert inputs must carry it as their sequence,
   * and it is part of the connector their ChallengeAssert parents pay to.
   */
  timelockChallengeAssert: number;
  /**
   * Security council member x-only public keys (hex, no prefix). Sourced from
   * the on-chain ProtocolParams contract via
   * `ViemProtocolParamsReader.getOffchainParamsByVersion(...).securityCouncilKeys`.
   */
  councilMembers: string[];
  /**
   * M-of-N council quorum threshold. Sourced from the on-chain ProtocolParams
   * contract via `ViemProtocolParamsReader.getOffchainParamsByVersion(...).councilQuorum`.
   */
  councilQuorum: number;
  /** BTC network (Mainnet, Testnet, etc.) */
  network: Network;
  /**
   * On-chain registered depositor payout scriptPubKey (hex, with or without
   * 0x prefix). Used to assert the VP-advertised payout transaction pays to
   * the depositor's registered address before the wallet produces a signature.
   */
  registeredPayoutScriptPubKey: string;
  /**
   * RFC-006 operator payout destinations. Forwarded to `buildPayoutPsbt` for
   * shape completeness only: this graph is signed under the
   * `depositor-as-claimer` role, whose payout has two outputs and reads
   * neither the keeper map nor the VP commission destination.
   */
  vkClaimerPayoutScriptPubKeys: Readonly<Record<string, string>>;
  /** See {@link vkClaimerPayoutScriptPubKeys} — unused for this role. */
  vpCommissionScriptPubKey: string;
}

export interface SignDepositorGraphParams {
  /** The depositor graph from VP response */
  depositorGraph: DepositorGraphTransactions;
  /** Bitcoin wallet for signing */
  btcWallet: BitcoinWallet;
  /** Authoritative inputs used to rebuild every PSBT locally */
  signingContext: DepositorGraphSigningContext;
}

/**
 * Sign all depositor graph transactions and assemble into presignatures.
 *
 * Flow:
 * 1. Build payout + per-challenger nopayout PSBTs locally
 * 2. Batch sign via wallet.signPsbts() if available, else sequential signPsbt()
 * 3. Extract Schnorr signatures from each signed PSBT
 * 4. Assemble into DepositorAsClaimerPresignatures
 */
export async function signDepositorGraph(
  params: SignDepositorGraphParams,
): Promise<DepositorAsClaimerPresignatures> {
  const { depositorGraph, btcWallet, signingContext } = params;

  // Validate the complete funding chain before even reading the wallet key.
  // The orchestrating flow performs the same check while fingerprinting, but
  // this service is also a public entry point and must be safe on its own.
  assertPresignClaimAssertLinkage({
    peginTxHex: signingContext.peginTxHex,
    claimTxHex: depositorGraph.claim_tx.tx_hex,
    assertTxHex: depositorGraph.assert_tx.tx_hex,
    path: "depositor_graph",
  });

  const walletPublicKey = await btcWallet.getPublicKeyHex();
  // Fail fast if the connected wallet doesn't match the on-chain registered
  // depositor key — otherwise extractPayoutSignature later fails after
  // multiple wallet popups with an opaque "no signature found" error.
  const { depositorPubkey } = validateWalletPubkey(
    walletPublicKey,
    stripHexPrefix(signingContext.depositorBtcPubkey),
  );

  // 1. Build all PSBTs locally
  const { psbtHexes, signOptions, challengerEntries } =
    await collectDepositorGraphPsbts(
      depositorGraph,
      walletPublicKey,
      signingContext,
    );

  // 2. Sign all PSBTs (batch when supported, sequential fallback for mobile)
  // signPsbtsWithFallback guarantees one signed PSBT per input (or throws), so
  // no separate arity check is needed here.
  const signedPsbtHexes = await signPsbtsWithFallback(
    btcWallet,
    psbtHexes,
    signOptions,
  );

  // 3. Pair requested with signed and extract signatures
  const psbtPairs: PsbtPair[] = psbtHexes.map((requestedPsbtHex, i) => ({
    requestedPsbtHex,
    returnedPsbtHex: signedPsbtHexes[i],
  }));
  return extractDepositorGraphSignatures(
    psbtPairs,
    challengerEntries,
    depositorPubkey,
  );
}
