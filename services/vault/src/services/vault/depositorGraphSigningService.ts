/**
 * Depositor Graph Signing Service
 *
 * Signs the depositor's own graph transactions (Payout, NoPayout per challenger,
 * ChallengeAssert per challenger) and assembles them into DepositorAsClaimerPresignatures
 * for submission to the vault provider.
 *
 * Transaction counts: 1 Payout + N NoPayout + N ChallengeAssert = 1 + 2N total PSBTs
 * (each ChallengeAssert PSBT has 3 inputs signed in one go)
 *
 * @see btc-vault docs/pegin.md — "Automatic Graph Creation & Presigning"
 */

import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "@babylonlabs-io/ts-sdk/shared";
import {
  buildChallengeAssertPsbt,
  buildDepositorPayoutPsbt,
  buildNoPayoutPsbt,
  extractPayoutSignature,
  type AssertPayoutNoPayoutConnectorParams,
  type ChallengeAssertConnectorParams,
  type PayoutConnectorParams,
} from "@babylonlabs-io/ts-sdk/tbv/core";

import type { VersionedOffchainParams } from "../../clients/eth-contract/protocol-params";
import type {
  DepositorAsClaimerPresignatures,
  DepositorGraphTransactions,
  DepositorPreSigsPerChallenger,
  PresignDataPerChallenger,
} from "../../clients/vault-provider-rpc/types";
import { signPsbtsWithFallback, stripHexPrefix } from "../../utils/btc";

/**
 * Number of ChallengeAssert inputs per challenger.
 * Protocol constant from btc-vault (NUM_UTXOS_FOR_CHALLENGE_ASSERT).
 */
const NUM_CHALLENGE_ASSERT_INPUTS = 3;

/**
 * Taproot script path sign options — disables tweak signer and prevents
 * auto-finalization so we can extract raw Schnorr signatures from tapScriptSig.
 */
function taprootScriptSignOptions(publicKey: string): SignPsbtOptions {
  return {
    autoFinalized: false,
    signInputs: [{ index: 0, publicKey, disableTweakSigner: true }],
  };
}

/** Sign options for ChallengeAssert PSBTs (one entry per input). */
function challengeAssertSignOptions(publicKey: string): SignPsbtOptions {
  return {
    autoFinalized: false,
    signInputs: Array.from({ length: NUM_CHALLENGE_ASSERT_INPUTS }, (_, i) => ({
      index: i,
      publicKey,
      disableTweakSigner: true,
    })),
  };
}

/**
 * Offchain parameters needed for depositor graph signing
 */
export interface DepositorGraphOffchainParams {
  /** Vault provider's BTC public key (x-only hex) — needed for PeginPayout connector */
  vaultProviderBtcPubkey: string;
  /** Vault keeper BTC public keys (x-only hex) — needed for PeginPayout connector */
  vaultKeeperBtcPubkeys: string[];
  /** CSV timelock in blocks for the PegIn output — needed for PeginPayout connector */
  timelockPegin: number;
  /** Local challenger pubkeys (currently empty []) */
  localChallengers: string[];
  /** Universal challenger pubkeys (sorted, x-only hex) */
  universalChallengers: string[];
  /** CSV timelock in blocks for the Assert output */
  timelockAssert: number;
  /** Security council member pubkeys (x-only hex) */
  councilMembers: string[];
  /** Council quorum (M-of-N multisig threshold) */
  councilQuorum: number;
}

/**
 * Parameters for signDepositorGraph
 */
export interface SignDepositorGraphParams {
  /** The depositor graph from VP response */
  depositorGraph: DepositorGraphTransactions;
  /** Depositor's BTC public key (x-only, 64-char hex) */
  depositorBtcPubkey: string;
  /** Bitcoin wallet for signing */
  btcWallet: BitcoinWallet;
  /** Offchain params for connector construction */
  offchainParams: DepositorGraphOffchainParams;
}

/** Tracks which indices in the flat PSBT array belong to which challenger */
interface ChallengerIndexEntry {
  challengerPubkey: string;
  noPayoutIdx: number;
  challengeAssertIdx: number;
}

/** Result of the build phase — flat PSBT array with index mapping */
interface BuiltDepositorGraphPsbts {
  psbtHexes: string[];
  signOptions: SignPsbtOptions[];
  challengerIndexMap: ChallengerIndexEntry[];
}

// ============================================================================
// Build phase
// ============================================================================

/**
 * Build ChallengeAssert connector params for each input of a challenger's CA tx.
 */
function buildChallengeAssertConnectorParams(
  challenger: PresignDataPerChallenger,
  depositorPubkey: string,
  challengerPubkey: string,
): ChallengeAssertConnectorParams[] {
  const params: ChallengeAssertConnectorParams[] = [];
  for (let j = 0; j < NUM_CHALLENGE_ASSERT_INPUTS; j++) {
    const connectorData = challenger.challenge_assert_connectors[j];
    if (!connectorData) {
      throw new Error(
        `Missing challenge_assert_connector data for challenger ${challengerPubkey}, index ${j}`,
      );
    }
    params.push({
      claimer: depositorPubkey,
      challenger: challengerPubkey,
      lamportHashesJson: connectorData.lamport_hashes_json,
      gcInputLabelHashesJson: connectorData.gc_input_label_hashes_json,
    });
  }
  return params;
}

/**
 * Build all PSBTs for the depositor graph and track their indices.
 *
 * Layout: [Payout, NoPayout_0, CA_0, NoPayout_1, CA_1, ...]
 */
async function buildDepositorGraphPsbts(
  depositorGraph: DepositorGraphTransactions,
  depositorPubkey: string,
  walletPublicKey: string,
  peginPayoutParams: PayoutConnectorParams,
  assertConnectorParams: AssertPayoutNoPayoutConnectorParams,
): Promise<BuiltDepositorGraphPsbts> {
  const psbtHexes: string[] = [];
  const signOptions: SignPsbtOptions[] = [];
  const challengerIndexMap: ChallengerIndexEntry[] = [];

  const taprootOpts = taprootScriptSignOptions(walletPublicKey);
  const challengeAssertOpts = challengeAssertSignOptions(walletPublicKey);

  // Index 0: Payout PSBT (uses PeginPayoutConnector — same as VP/VK payout)
  try {
    const payoutPsbt = await buildDepositorPayoutPsbt({
      payoutTxHex: depositorGraph.payout_tx.tx_hex,
      prevouts: depositorGraph.payout_prevouts,
      connectorParams: peginPayoutParams,
    });
    psbtHexes.push(payoutPsbt);
    signOptions.push(taprootOpts);
  } catch (err) {
    throw new Error(
      `Failed to build depositor Payout PSBT: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Per-challenger: 1 NoPayout + 1 ChallengeAssert (with 3 inputs)
  for (const challenger of depositorGraph.challenger_presign_data) {
    const challengerPubkey = stripHexPrefix(challenger.challenger_pubkey);

    // Validate prevouts early (before building PSBTs)
    if (
      !challenger.challenge_assert_prevouts ||
      challenger.challenge_assert_prevouts.length === 0
    ) {
      throw new Error(
        `Missing challenge_assert_prevouts for challenger ${challengerPubkey}`,
      );
    }

    // NoPayout PSBT
    const noPayoutIdx = psbtHexes.length;
    try {
      const noPayoutPsbt = await buildNoPayoutPsbt({
        noPayoutTxHex: challenger.nopayout_tx.tx_hex,
        challengerPubkey,
        prevouts: challenger.nopayout_prevouts,
        connectorParams: assertConnectorParams,
      });
      psbtHexes.push(noPayoutPsbt);
      signOptions.push(taprootOpts);
    } catch (err) {
      throw new Error(
        `Failed to build NoPayout PSBT for challenger ${challengerPubkey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // ChallengeAssert PSBT — 1 PSBT with NUM_CHALLENGE_ASSERT_INPUTS inputs
    const challengeAssertIdx = psbtHexes.length;
    const connectorParamsPerInput = buildChallengeAssertConnectorParams(
      challenger,
      depositorPubkey,
      challengerPubkey,
    );

    try {
      const caPsbt = await buildChallengeAssertPsbt({
        challengeAssertTxHex: challenger.challenge_assert_tx.tx_hex,
        prevouts: challenger.challenge_assert_prevouts,
        connectorParamsPerInput,
      });
      psbtHexes.push(caPsbt);
      signOptions.push(challengeAssertOpts);
    } catch (err) {
      throw new Error(
        `Failed to build ChallengeAssert PSBT for challenger ${challengerPubkey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    challengerIndexMap.push({
      challengerPubkey,
      noPayoutIdx,
      challengeAssertIdx,
    });
  }

  return { psbtHexes, signOptions, challengerIndexMap };
}

// ============================================================================
// Extract phase
// ============================================================================

/**
 * Extract all signatures from signed PSBTs and assemble into presignatures.
 */
function extractDepositorGraphSignatures(
  signedPsbtHexes: string[],
  challengerIndexMap: ChallengerIndexEntry[],
  depositorPubkey: string,
): DepositorAsClaimerPresignatures {
  // Payout signature (index 0, input 0)
  const payoutSignature = extractPayoutSignature(
    signedPsbtHexes[0],
    depositorPubkey,
  );

  // Per-challenger signatures
  const perChallenger: Record<string, DepositorPreSigsPerChallenger> = {};
  for (const entry of challengerIndexMap) {
    const caSignedPsbt = signedPsbtHexes[entry.challengeAssertIdx];

    perChallenger[entry.challengerPubkey] = {
      challenge_assert_signatures: Array.from(
        { length: NUM_CHALLENGE_ASSERT_INPUTS },
        (_, i) => extractPayoutSignature(caSignedPsbt, depositorPubkey, i),
      ) as [string, string, string],
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

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Sign all depositor graph transactions and assemble into presignatures.
 *
 * Flow:
 * 1. Build all PSBTs (1 Payout + N NoPayout + N ChallengeAssert)
 * 2. Batch sign via wallet.signPsbts() if available, else sequential signPsbt()
 * 3. Extract Schnorr signatures from each signed PSBT
 * 4. Assemble into DepositorAsClaimerPresignatures
 */
/**
 * Parameters for prepareAndSignDepositorGraph — the high-level wrapper
 * that derives offchain params and delegates to signDepositorGraph.
 */
export interface PrepareAndSignDepositorGraphParams {
  depositorGraph: DepositorGraphTransactions;
  depositorBtcPubkey: string;
  btcWallet: BitcoinWallet;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  timelockPegin: number;
  getOffchainParamsByVersion: (
    version: number,
  ) => VersionedOffchainParams | undefined;
}

/**
 * Derive offchain params from the depositor graph version, compute local
 * challengers vs universal challengers, then sign all depositor graph PSBTs.
 *
 * This wraps signDepositorGraph with the param-derivation logic that was
 * previously duplicated across useDepositFlow, useMultiVaultDepositFlow,
 * and usePayoutSigningState.
 */
export async function prepareAndSignDepositorGraph(
  params: PrepareAndSignDepositorGraphParams,
): Promise<DepositorAsClaimerPresignatures> {
  const {
    depositorGraph,
    depositorBtcPubkey,
    btcWallet,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    timelockPegin,
    getOffchainParamsByVersion,
  } = params;

  const offchainParams = getOffchainParamsByVersion(
    depositorGraph.offchain_params_version,
  );
  if (!offchainParams) {
    throw new Error(
      `Offchain params version ${depositorGraph.offchain_params_version} not found. Please refresh the page.`,
    );
  }

  const sortedUCPubkeys = universalChallengerBtcPubkeys
    .map(stripHexPrefix)
    .sort();
  const councilMembers = offchainParams.securityCouncilKeys.map(stripHexPrefix);

  // Derive local challengers: any challenger in the graph that isn't a UC
  const ucSet = new Set(sortedUCPubkeys);
  const localChallengers = depositorGraph.challenger_presign_data
    .map((c) => stripHexPrefix(c.challenger_pubkey))
    .filter((pk) => !ucSet.has(pk))
    .sort();

  return signDepositorGraph({
    depositorGraph,
    depositorBtcPubkey,
    btcWallet,
    offchainParams: {
      vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys,
      timelockPegin,
      localChallengers,
      universalChallengers: sortedUCPubkeys,
      timelockAssert: Number(offchainParams.timelockAssert),
      councilMembers,
      councilQuorum: offchainParams.councilQuorum,
    },
  });
}

export async function signDepositorGraph(
  params: SignDepositorGraphParams,
): Promise<DepositorAsClaimerPresignatures> {
  const { depositorGraph, depositorBtcPubkey, btcWallet, offchainParams } =
    params;

  const depositorPubkey = stripHexPrefix(depositorBtcPubkey);

  // Get the wallet's compressed public key for signInputs identification
  const walletPublicKey = await btcWallet.getPublicKeyHex();

  // Build connector params
  const peginPayoutParams: PayoutConnectorParams = {
    depositor: depositorPubkey,
    vaultProvider: stripHexPrefix(offchainParams.vaultProviderBtcPubkey),
    vaultKeepers: offchainParams.vaultKeeperBtcPubkeys.map(stripHexPrefix),
    universalChallengers: offchainParams.universalChallengers,
    timelockPegin: offchainParams.timelockPegin,
  };

  const assertConnectorParams: AssertPayoutNoPayoutConnectorParams = {
    claimer: depositorPubkey,
    localChallengers: offchainParams.localChallengers,
    universalChallengers: offchainParams.universalChallengers,
    timelockAssert: offchainParams.timelockAssert,
    councilMembers: offchainParams.councilMembers,
    councilQuorum: offchainParams.councilQuorum,
  };

  // 1. Build all PSBTs
  const { psbtHexes, signOptions, challengerIndexMap } =
    await buildDepositorGraphPsbts(
      depositorGraph,
      depositorPubkey,
      walletPublicKey,
      peginPayoutParams,
      assertConnectorParams,
    );

  // 2. Sign all PSBTs (batch when wallet supports it, sequential fallback for mobile)
  let signedPsbtHexes: string[];

  try {
    signedPsbtHexes = await signPsbtsWithFallback(
      btcWallet,
      psbtHexes,
      signOptions,
    );
  } catch (err) {
    throw new Error(
      `Failed to sign depositor graph transactions: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
    );
  }

  if (signedPsbtHexes.length !== psbtHexes.length) {
    throw new Error(
      `Wallet returned ${signedPsbtHexes.length} signed PSBTs, expected ${psbtHexes.length}`,
    );
  }

  // 3. Extract signatures and assemble presignatures
  return extractDepositorGraphSignatures(
    signedPsbtHexes,
    challengerIndexMap,
    depositorPubkey,
  );
}
