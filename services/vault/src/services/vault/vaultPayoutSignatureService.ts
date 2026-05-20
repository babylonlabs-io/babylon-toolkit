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
  getSortedXOnlyPubkeys,
  processPublicKeyToXOnly,
  stripHexPrefix,
  type Network,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Hex } from "viem";

import {
  getVaultFromChain,
  getVaultProviderBtcPubkeyFromChain,
} from "../../clients/eth-contract/btc-vault-registry/query";
import {
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
} from "../../clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "../../config/pegin";

/**
 * Exclusive upper bound on VP commission (basis points). Matches the
 * `BTCVaultRegistry._validateCommission` ceiling (`commissionBps >= 10000`
 * reverts) and the basis-points denominator used to size the commission
 * output.
 */
const VP_COMMISSION_BPS_EXCLUSIVE_MAX = 10_000;

/**
 * Absolute floor on a realizable VP commission. The contract permits
 * `VersionedOffchainParams.minVpCommissionBps` to be `0`, but the Rust
 * tx-graph builder (`btc-vault crates/vault/src/tx_graph/config.rs`) refuses
 * to construct a graph with `vp_commission_bps == 0`. So a vault that can
 * actually produce a VP-claimer payout always has commission `>= 1`; the
 * effective floor is `max(minVpCommissionBps, 1)`.
 */
const MIN_REALIZABLE_VP_COMMISSION_BPS = 1;

export interface PayoutVaultKeeper {
  btcPubKey: string;
}

export interface PayoutUniversalChallenger {
  btcPubKey: string;
}

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
}

export interface PreparedSigningData {
  context: SigningContext;
  vaultProviderAddress: Hex;
}

/** Detailed progress for payout signing (used by UI layer) */
export interface PayoutSigningProgress {
  /** Number of signing steps completed */
  completed: number;
  /** Total number of claimers */
  totalClaimers: number;
}

/**
 * Resolve vault provider's BTC public key.
 * Reads the authoritative value from BTCVaultRegistry and treats the provided
 * value only as an untrusted hint that must match.
 */
export async function resolveVaultProviderBtcPubkey(
  address: Address,
  btcPubKey?: string,
): Promise<string> {
  const onChainBtcPubkey = processPublicKeyToXOnly(
    await getVaultProviderBtcPubkeyFromChain(address),
  ).toLowerCase();

  if (btcPubKey) {
    const hintedBtcPubkey = processPublicKeyToXOnly(btcPubKey).toLowerCase();
    if (hintedBtcPubkey !== onChainBtcPubkey) {
      throw new Error(
        `Vault provider BTC pubkey mismatch for ${address}: indexer hint does not match on-chain registry`,
      );
    }
  }

  return onChainBtcPubkey;
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

  // Trust-boundary check on the VP commission read from chain. Mirrors the
  // contract's own `BTCVaultRegistry._validateCommission`: `commissionBps`
  // must be `>= minVpCommissionBps` (version-locked) and `< 10000`. The
  // floor is `max(minVpCommissionBps, 1)` because the Rust tx-graph builder
  // refuses `vp_commission_bps == 0`. Validating here means the SDK's
  // `buildPayoutPsbt` can trust `commissionBps` for its cap math.
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

  const vaultProviderBtcPubkey = await resolveVaultProviderBtcPubkey(
    vault.vaultProvider,
    vaultProviderBtcPubKey,
  );

  const vaultKeeperBtcPubkeys = getSortedXOnlyPubkeys(
    vaultKeepers.map((vk) => vk.btcPubKey),
  );
  const universalChallengerBtcPubkeys = getSortedXOnlyPubkeys(
    universalChallengers.map((uc) => uc.btcPubKey),
  );

  return {
    context: {
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
    },
    vaultProviderAddress: vault.vaultProvider,
  };
}
