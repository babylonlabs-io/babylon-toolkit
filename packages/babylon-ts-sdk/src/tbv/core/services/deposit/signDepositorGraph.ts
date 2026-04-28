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

import { type Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Transaction } from "bitcoinjs-lib";

import type { BitcoinWallet, SignPsbtOptions } from "../../../../shared/wallets/interfaces";
import type {
  DepositorAsClaimerPresignatures,
  DepositorGraphTransactions,
  DepositorPreSigsPerChallenger,
  PresignDataPerChallenger,
} from "../../clients/vault-provider/types";
import {
  assertNoPayoutOutputMatchesChallenger,
  buildNoPayoutPsbt,
} from "../../primitives/psbt/noPayout";
import {
  assertPayoutOutputMatchesRegistered,
  buildPayoutPsbt,
  extractPayoutSignature,
} from "../../primitives/psbt/payout";
import {
  stripHexPrefix,
  uint8ArrayToHex,
} from "../../primitives/utils/bitcoin";
import { createTaprootScriptPathSignOptions } from "../../utils/signing";

/**
 * The depositor signs exactly one input (index 0) per payout/nopayout PSBT.
 * Used to construct SignPsbtOptions for wallet.signPsbt(). PSBTs may carry
 * additional inputs (the payout PSBT includes the assert prevout; the nopayout
 * PSBT includes the two ChallengeAssert prevouts) so the Taproot SIGHASH_DEFAULT
 * sighash commits to all prevouts, but those inputs are not signed by the
 * depositor.
 */
const DEPOSITOR_SIGNED_INPUT_COUNT = 1;

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
 * Compute the local-challenger set for the depositor-as-claimer flow.
 *
 * Per the protocol (see btc-vault crates/vault/src/lib.rs - `LocalChallengers`):
 *   localChallengers = {VaultProvider, VaultKeepers} \ {Claimer}
 *
 * For the depositor-as-claimer flow the claimer is the depositor, so this
 * removes the depositor from the union if present (it usually isn't).
 * The protocol guarantees the result is non-empty by construction.
 */
function deriveLocalChallengers(
  vaultProviderBtcPubkey: string,
  vaultKeeperBtcPubkeys: string[],
  depositorBtcPubkey: string,
): string[] {
  const depositor = stripHexPrefix(depositorBtcPubkey).toLowerCase();
  const all = [vaultProviderBtcPubkey, ...vaultKeeperBtcPubkeys].map((k) =>
    stripHexPrefix(k).toLowerCase(),
  );
  const filtered = all.filter((k) => k !== depositor);
  if (filtered.length === 0) {
    throw new Error(
      "Cannot derive localChallengers: removing depositor from {vaultProvider, vaultKeepers} left an empty set",
    );
  }
  return filtered;
}

/**
 * Read the txid that the given input references in the unsigned tx, in display
 * (big-endian) hex order. bitcoinjs-lib stores `input.hash` in internal
 * little-endian byte order, which is the reverse of how txids are normally
 * displayed.
 */
function readInputTxid(tx: Transaction, inputIndex: number): string {
  const input = tx.ins[inputIndex];
  return uint8ArrayToHex(new Uint8Array(input.hash).slice().reverse());
}

/**
 * Verify the noPayout transaction's input at `inputIndex` references the
 * given parent transaction at vout 0 (per nopayout.rs the layout is fixed:
 * Assert:0, ChallengeAssertX:0, ChallengeAssertY:0).
 */
function assertInputReferencesParent(
  noPayoutTx: Transaction,
  inputIndex: number,
  parentTx: Transaction,
  parentLabel: string,
  challengerPubkey: string,
): void {
  const input = noPayoutTx.ins[inputIndex];
  if (input.index !== 0) {
    throw new Error(
      `NoPayout (challenger ${challengerPubkey}) input ${inputIndex} expected to spend ${parentLabel} vout 0, got vout ${input.index}`,
    );
  }
  const parentTxid = parentTx.getId();
  const inputTxid = readInputTxid(noPayoutTx, inputIndex);
  if (inputTxid !== parentTxid) {
    throw new Error(
      `NoPayout (challenger ${challengerPubkey}) input ${inputIndex} does not reference ${parentLabel} (expected txid ${parentTxid}, got ${inputTxid})`,
    );
  }
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

  // 1. Validate the payout transaction's largest output pays to the
  //    depositor's on-chain registered payout scriptPubKey. The payout tx
  //    hex is supplied by the VP and otherwise unconstrained; this assertion
  //    pins the destination of the funds.
  assertPayoutOutputMatchesRegistered(
    depositorGraph.payout_tx.tx_hex,
    ctx.registeredPayoutScriptPubKey,
  );

  // 2. Build the payout PSBT locally. Every sighash-relevant field
  //    (witnessUtxo, tapLeafScript, controlBlock, tapInternalKey) is derived
  //    from on-chain trusted connector params, not from the VP. The VP-
  //    supplied assert tx hex is implicitly pinned by buildPayoutPsbt's
  //    input-1 txid check against payoutTx.ins[1].hash.
  const builtPayout = await buildPayoutPsbt({
    payoutTxHex: depositorGraph.payout_tx.tx_hex,
    peginTxHex: ctx.peginTxHex,
    assertTxHex: depositorGraph.assert_tx.tx_hex,
    depositorBtcPubkey: ctx.depositorBtcPubkey,
    vaultProviderBtcPubkey: ctx.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: ctx.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: ctx.universalChallengerBtcPubkeys,
    timelockPegin: ctx.timelockPegin,
    network: ctx.network,
  });
  psbtHexes.push(builtPayout.psbtHex);
  signOptions.push(
    createTaprootScriptPathSignOptions(
      walletPublicKey,
      DEPOSITOR_SIGNED_INPUT_COUNT,
    ),
  );

  // 3. Per-challenger: build the NoPayout PSBT locally too.
  const localChallengers = deriveLocalChallengers(
    ctx.vaultProviderBtcPubkey,
    ctx.vaultKeeperBtcPubkeys,
    ctx.depositorBtcPubkey,
  );
  const claimerPubkey = stripHexPrefix(ctx.depositorBtcPubkey);
  const assertTxParsed = Transaction.fromHex(
    stripHexPrefix(depositorGraph.assert_tx.tx_hex),
  );

  for (const challenger of depositorGraph.challenger_presign_data) {
    const challengerPubkey = stripHexPrefix(challenger.challenger_pubkey);

    const noPayoutIdx = psbtHexes.length;
    const noPayoutHex = await buildLocalNoPayoutPsbt({
      challenger,
      challengerPubkey,
      claimerPubkey,
      localChallengers,
      assertTxParsed,
      ctx,
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

interface BuildLocalNoPayoutPsbtParams {
  challenger: PresignDataPerChallenger;
  challengerPubkey: string;
  claimerPubkey: string;
  localChallengers: string[];
  assertTxParsed: Transaction;
  ctx: DepositorGraphSigningContext;
}

/**
 * Build a single NoPayout PSBT for one challenger from authoritative
 * inputs. Validates the VP-supplied parent transactions match what the
 * NoPayout transaction commits to via input txids, and asserts the output
 * pays to the protocol-defined challenger sink before returning.
 *
 * NoPayout transaction layout (per
 * btc-vault crates/vault/src/transactions/nopayout.rs):
 * - 3 inputs (fixed order):
 *   - Input 0: Assert tx output 0 (depositor signs - NoPayout path)
 *   - Input 1: ChallengeAssertX tx output 0 (with timelock)
 *   - Input 2: ChallengeAssertY tx output 0 (with timelock)
 * - 1 output: BIP-86 P2TR to the challenger
 */
async function buildLocalNoPayoutPsbt(
  params: BuildLocalNoPayoutPsbtParams,
): Promise<string> {
  const {
    challenger,
    challengerPubkey,
    claimerPubkey,
    localChallengers,
    assertTxParsed,
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

  if (noPayoutTx.ins.length !== 3) {
    throw new Error(
      `NoPayout (challenger ${challengerPubkey}) must have exactly 3 inputs, got ${noPayoutTx.ins.length}`,
    );
  }

  // Pin every input's parent. Each parent's outs[0] is the authoritative
  // prevout - because we verified the parent's txid matches what the NoPayout
  // tx commits to, the parent cannot be substituted without changing the
  // NoPayout txid.
  assertInputReferencesParent(
    noPayoutTx,
    0,
    assertTxParsed,
    "Assert",
    challengerPubkey,
  );
  assertInputReferencesParent(
    noPayoutTx,
    1,
    challengeAssertXTx,
    "ChallengeAssertX",
    challengerPubkey,
  );
  assertInputReferencesParent(
    noPayoutTx,
    2,
    challengeAssertYTx,
    "ChallengeAssertY",
    challengerPubkey,
  );

  const prevouts = [
    assertTxParsed.outs[0],
    challengeAssertXTx.outs[0],
    challengeAssertYTx.outs[0],
  ].map((out) => ({
    script_pubkey: uint8ArrayToHex(new Uint8Array(out.script)),
    value: out.value,
  }));

  return buildNoPayoutPsbt({
    noPayoutTxHex: challenger.nopayout_tx.tx_hex,
    challengerPubkey,
    prevouts,
    connectorParams: {
      claimer: claimerPubkey,
      localChallengers,
      universalChallengers: ctx.universalChallengerBtcPubkeys,
      timelockAssert: ctx.timelockAssert,
      councilMembers: ctx.councilMembers,
      councilQuorum: ctx.councilQuorum,
    },
  });
}

// ============================================================================
// Extract phase
// ============================================================================

/**
 * Extract all signatures from signed PSBTs and assemble into presignatures.
 */
function extractDepositorGraphSignatures(
  signedPsbtHexes: string[],
  challengerEntries: ChallengerEntry[],
  depositorPubkey: string,
): DepositorAsClaimerPresignatures {
  const payoutSignature = extractPayoutSignature(
    signedPsbtHexes[0],
    depositorPubkey,
  );

  const perChallenger: Record<string, DepositorPreSigsPerChallenger> = {};
  for (const entry of challengerEntries) {
    perChallenger[entry.challengerPubkey] = {
      nopayout_signature: extractPayoutSignature(
        signedPsbtHexes[entry.noPayoutIdx],
        depositorPubkey,
      ),
    };
  }

  return {
    payout_signatures: {
      payout_signature: payoutSignature,
    },
    per_challenger: perChallenger,
  };
}

/**
 * Sign multiple PSBTs, using batch signing when the wallet supports it.
 * Falls back to sequential `signPsbt` calls for wallets without `signPsbts`.
 */
async function signPsbtsWithFallback(
  wallet: BitcoinWallet,
  psbtHexes: string[],
  options?: SignPsbtOptions[],
): Promise<string[]> {
  if (typeof wallet.signPsbts === "function") {
    return wallet.signPsbts(psbtHexes, options);
  }

  const signed: string[] = [];
  for (let i = 0; i < psbtHexes.length; i++) {
    signed.push(await wallet.signPsbt(psbtHexes[i], options?.[i]));
  }
  return signed;
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
   * Assert CSV timelock from the locked offchain params version (blocks).
   * Sourced from the on-chain ProtocolParams contract via
   * `ViemProtocolParamsReader.getOffchainParamsByVersion(...).timelockAssert`.
   */
  timelockAssert: number;
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

  const depositorPubkey = stripHexPrefix(signingContext.depositorBtcPubkey);
  const walletPublicKey = await btcWallet.getPublicKeyHex();

  // 1. Build all PSBTs locally
  const { psbtHexes, signOptions, challengerEntries } =
    await collectDepositorGraphPsbts(
      depositorGraph,
      walletPublicKey,
      signingContext,
    );

  // 2. Sign all PSBTs (batch when supported, sequential fallback for mobile)
  const signedPsbtHexes = await signPsbtsWithFallback(
    btcWallet,
    psbtHexes,
    signOptions,
  );

  if (signedPsbtHexes.length !== psbtHexes.length) {
    throw new Error(
      `Wallet returned ${signedPsbtHexes.length} signed PSBTs, expected ${psbtHexes.length}`,
    );
  }

  // 3. Extract signatures and assemble presignatures
  return extractDepositorGraphSignatures(
    signedPsbtHexes,
    challengerEntries,
    depositorPubkey,
  );
}
