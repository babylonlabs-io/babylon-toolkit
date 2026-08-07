/**
 * Vault-tier helpers for payout signing.
 *
 * Most of the former contents of this module moved to the SDK's
 * `runDepositorPresignFlow` orchestrator. What remains is app-specific:
 *
 * - `prepareSigningContext` — reads version-locked vault data from the
 *   BTCVaultRegistry contract and composes the `SigningContext` that the
 *   SDK orchestrator requires. Not in the SDK because contract readers are
 *   wired to vault's viem public client.
 * - `getSorted*Pubkeys` — canonical lexicographic sort that matches the
 *   Rust backend. Reused by `vaultRefundService`.
 * - `resolveVaultProviderBtcPubkey` — reads the VP BTC key from chain and
 *   treats a caller hint as an untrusted cross-check.
 * - `PayoutSigningProgress` type — UI progress shape used across deposit
 *   components; the SDK exposes `(completed, total)` positional callbacks
 *   and this object shape is the vault-tier adapter.
 */

import {
  assertVaultProviderHintAccepted,
  canonicalizeBtcPubkey,
  resolveParticipantKeysAtEpochs,
  stripHexPrefix,
  type Network,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Hex } from "viem";

import {
  getVaultFromChain,
  getVaultKeyEpochsFromChain,
  getVaultProviderGenesisBtcPubkeyFromChain,
} from "../../clients/eth-contract/btc-vault-registry/query";
import {
  getOperationKeyReader,
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "../../clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "../../config/pegin";

/**
 * Exclusive upper bound on VP commission (bps) — `BTCVaultRegistry._validateCommission`
 * ceiling. Local literal by design: the SDK's `MAX_VP_COMMISSION_BPS_EXCLUSIVE`
 * is an internal module, not public API.
 */
const VP_COMMISSION_BPS_EXCLUSIVE_MAX = 10_000;

/**
 * Absolute floor on a realizable VP commission: the btc-vault tx-graph builder
 * refuses `vp_commission_bps == 0`, so the effective floor is
 * `max(minVpCommissionBps, 1)`.
 */
const MIN_REALIZABLE_VP_COMMISSION_BPS = 1;

export interface PrepareSigningContextParams {
  /** Derived vault ID (for contract calls) */
  vaultId: string;
  depositorBtcPubkey: string;
  /** Optional GraphQL/indexer hint; cross-checked against the on-chain VP BTC key */
  vaultProviderBtcPubKey?: string;
  /** Depositor's registered payout scriptPubKey (hex) for payout output validation */
  registeredPayoutScriptPubKey: string;
}

/** Context required for signing payout transactions */
export interface SigningContext {
  /** Vault core (tx-graph) version stamped on-chain at registration */
  vaultCoreVersion: number;
  peginTxHex: string;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  depositorBtcPubkey: string;
  timelockPegin: number;
  /** Assert CSV timelock (blocks) — required for depositor-graph NoPayout local rebuild */
  timelockAssert: number;
  /** Security council member x-only pubkeys (hex, no prefix) */
  councilMembers: string[];
  /** M-of-N council quorum threshold */
  councilQuorum: number;
  network: Network;
  /** On-chain registered depositor payout scriptPubKey (hex) for payout output validation */
  registeredPayoutScriptPubKey: string;
  /**
   * VP commission in basis points (`1..=9999`) from BTCVaultRegistry.
   * Forwarded to `buildPayoutPsbt` to cap the VP-claimer commission output.
   */
  commissionBps: number;
  /**
   * Tx-graph fee rate (sat/vB) from the vault's locked offchain params
   * version — the rate the VP built the graph with. Bounds every payout's
   * implicit fee (device fee-bound model).
   */
  protocolFeeRate: bigint;

  /**
   * RFC-006 keeper payout destinations at the vault's frozen
   * `appKeeperKeyEpoch`, keyed by lowercased x-only operation pubkey.
   */
  vkClaimerPayoutScriptPubKeys: Readonly<Record<string, string>>;
  /** RFC-006 VP commission destination at the vault's frozen `vpKeyEpoch`. */
  vpCommissionScriptPubKey: string;
}

export interface PreparedSigningData {
  context: SigningContext;
  vaultProviderAddress: Hex;
}

export type PayoutSigningPhase = "auth" | "claimers" | "graph";

/** Detailed progress for payout signing (used by UI layer) */
export interface PayoutSigningProgress {
  phase: PayoutSigningPhase;
  completed: number;
  total: number;
}

/**
 * Resolve a vault provider's *registration* BTC public key.
 *
 * Reads the authoritative value from BTCVaultRegistry and treats the caller's
 * value only as an untrusted hint. The hint never influences the result — it is
 * returned from chain either way — so its job is to catch a wrong VP address or
 * a stale indexer view, not to supply key material.
 *
 * Under RFC-006 the hint is accepted against *either* the registration key or
 * the provider's current operation key — the policy owned by
 * `assertVaultProviderHintAccepted`, which the deposit and refund paths share.
 * Comparing only against the registration key would hard-fail payout signing
 * for every depositor of a rotated provider the day the indexer starts serving
 * operation keys.
 *
 * The returned registration key is only used as the genesis fallback for
 * epoch-based resolution; the keys actually signed with come from
 * `resolveParticipantKeysAtEpochs`.
 */
export async function resolveVaultProviderBtcPubkey(
  address: Address,
  btcPubKey?: string,
): Promise<string> {
  const registrationBtcPubkey = canonicalizeBtcPubkey(
    await getVaultProviderGenesisBtcPubkeyFromChain(address),
  );

  await assertVaultProviderHintAccepted({
    vaultProviderEthAddress: address,
    hintBtcPubkey: btcPubKey,
    registrationBtcPubkey,
    readCurrentOperationBtcPubkey: () =>
      getVaultRegistryReader().getCurrentVaultProviderOperationBtcKey(address),
  });

  return registrationBtcPubkey;
}

/**
 * Prepare the signing context by fetching all required data from the
 * on-chain contract at the vault's locked versions.
 *
 * Never trusts the GraphQL indexer for signing-critical fields. The optional
 * vault-provider BTC pubkey supplied by callers is only a hint and must match
 * BTCVaultRegistry before it is used for payout signing.
 */
export async function prepareSigningContext(
  params: PrepareSigningContextParams,
): Promise<PreparedSigningData> {
  const {
    vaultId,
    depositorBtcPubkey,
    vaultProviderBtcPubKey,
    registeredPayoutScriptPubKey,
  } = params;

  const vault = await getVaultFromChain(vaultId as Hex);

  const protocolParamsReader = await getProtocolParamsReader();
  // Pull the version-locked offchain params once: timelockPegin (derived from
  // timelockAssert), plus the assert-period fields needed to rebuild the
  // depositor-graph NoPayout PSBT locally.
  const offchainParams = await protocolParamsReader.getOffchainParamsByVersion(
    vault.offchainParamsVersion,
  );
  const timelockPegin = await protocolParamsReader.getTimelockPeginByVersion(
    vault.offchainParamsVersion,
  );

  // Trust-boundary check on the VP commission read from chain — mirrors
  // `BTCVaultRegistry._validateCommission` so `buildPayoutPsbt` can trust it.
  const minCommissionBps = Math.max(
    offchainParams.minVpCommissionBps,
    MIN_REALIZABLE_VP_COMMISSION_BPS,
  );
  if (
    !Number.isInteger(vault.vaultProviderCommissionBps) ||
    vault.vaultProviderCommissionBps < minCommissionBps ||
    vault.vaultProviderCommissionBps >= VP_COMMISSION_BPS_EXCLUSIVE_MAX
  ) {
    throw new Error(
      `VP commission ${vault.vaultProviderCommissionBps} bps out of protocol ` +
        `range [${minCommissionBps}, ${VP_COMMISSION_BPS_EXCLUSIVE_MAX}) ` +
        `for offchain params version ${vault.offchainParamsVersion}`,
    );
  }

  const councilMembers = offchainParams.securityCouncilKeys
    .map((k) => stripHexPrefix(k))
    .sort();

  const vaultKeeperReader = await getVaultKeeperReader();
  const vaultKeepers = await vaultKeeperReader.getVaultKeepersByVersion(
    vault.applicationEntryPoint,
    vault.appVaultKeepersVersion,
  );
  if (vaultKeepers.length === 0) {
    throw new Error(
      `No vault keepers found for version ${vault.appVaultKeepersVersion}`,
    );
  }

  const universalChallengerReader = await getUniversalChallengerReader();
  const universalChallengers =
    await universalChallengerReader.getUniversalChallengersByVersion(
      vault.universalChallengersVersion,
    );
  if (universalChallengers.length === 0) {
    throw new Error(
      `No universal challengers found for version ${vault.universalChallengersVersion}`,
    );
  }

  const registrationVpBtcPubkey = await resolveVaultProviderBtcPubkey(
    vault.vaultProvider,
    vaultProviderBtcPubKey,
  );

  // RFC-006. This vault froze its key epochs at creation, so it must be signed
  // with the keys bonded *then* — not whatever the operators hold now. The
  // rosters above are already at the vault's frozen membership versions, which
  // is what supplies the genesis fallback for keepers and challengers.
  const operationKeyReader = await getOperationKeyReader();
  const epochs = await getVaultKeyEpochsFromChain(vaultId as Hex);
  const query = {
    vaultProviderEthAddress: vault.vaultProvider,
    vaultProviderGenesisBtcPubkey: `0x${registrationVpBtcPubkey}` as Hex,
    applicationEntryPoint: vault.applicationEntryPoint,
    vaultKeepers,
    universalChallengers,
  };

  const [participantKeys, payoutScripts] = await Promise.all([
    resolveParticipantKeysAtEpochs({ operationKeyReader, query, epochs }),
    operationKeyReader.getPayoutScriptsAtEpochs(query, epochs),
  ]);

  const vaultProviderBtcPubkey =
    participantKeys.vaultProvider.operationBtcPubkey;
  const vaultKeeperBtcPubkeys = participantKeys.vaultKeeperOperationKeysSorted;
  const universalChallengerBtcPubkeys =
    participantKeys.universalChallengerOperationKeysSorted;

  // Keyed by the *operation* key, which is what arrives as `claimer_pubkey`.
  // Built from the roster-ordered pairs, never by index-joining a sorted
  // array — a rotated key sorts somewhere else.
  const vkClaimerPayoutScriptPubKeys = Object.fromEntries(
    participantKeys.vaultKeepers.map((keeper, i) => [
      keeper.operationBtcPubkey.toLowerCase(),
      payoutScripts.vaultKeepers[i],
    ]),
  );
  const vpCommissionScriptPubKey = payoutScripts.vaultProvider;

  return {
    context: {
      // Stamped at registration — the graph version this vault's scripts
      // were built with, independent of the current activeVaultCoreVersion.
      vaultCoreVersion: vault.vaultCoreVersion,
      peginTxHex: vault.depositorSignedPeginTx,
      vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys,
      depositorBtcPubkey,
      timelockPegin,
      timelockAssert: Number(offchainParams.timelockAssert),
      councilMembers,
      councilQuorum: offchainParams.councilQuorum,
      network: getBTCNetworkForWASM(),
      registeredPayoutScriptPubKey,
      commissionBps: vault.vaultProviderCommissionBps,
      // Version-locked graph-build rate — same fetch as timelockAssert above.
      protocolFeeRate: offchainParams.feeRate,
      vkClaimerPayoutScriptPubKeys,
      vpCommissionScriptPubKey,
    },
    vaultProviderAddress: vault.vaultProvider,
  };
}
