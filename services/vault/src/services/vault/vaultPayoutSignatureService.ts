/**
 * Vault-tier helpers for payout signing.
 *
 * Most of the former contents of this module moved to the SDK's
 * `pollAndSignPayouts` orchestrator. What remains is app-specific:
 *
 * - `prepareSigningContext` — reads version-locked vault data from the
 *   BTCVaultRegistry contract and composes the `SigningContext` that the
 *   SDK orchestrator requires. Not in the SDK because contract readers are
 *   wired to vault's viem public client.
 * - `getSorted*Pubkeys` — canonical lexicographic sort that matches the
 *   Rust backend. Reused by `vaultRefundService`.
 * - `resolveVaultProviderBtcPubkey` — caller hint + fallback to GraphQL.
 * - `PayoutSigningProgress` type — UI progress shape used across deposit
 *   components; the SDK exposes `(completed, total)` positional callbacks
 *   and this object shape is the vault-tier adapter.
 */

import type { Network } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Hex } from "viem";

import { getVaultFromChain } from "../../clients/eth-contract/btc-vault-registry/query";
import {
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
} from "../../clients/eth-contract/sdk-readers";
import { getBTCNetworkForWASM } from "../../config/pegin";
import { stripHexPrefix } from "../../utils/btc";

import { fetchVaultProviderById } from "./fetchVaultProviders";

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
  /** Vault provider's BTC public key hint (optional — resolved from GraphQL if missing) */
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
  network: Network;
  /** On-chain registered depositor payout scriptPubKey (hex) for payout output validation */
  registeredPayoutScriptPubKey: string;
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
 * Uses provided key or fetches from GraphQL if not provided.
 */
export async function resolveVaultProviderBtcPubkey(
  address: Address,
  btcPubKey?: string,
): Promise<string> {
  if (btcPubKey) {
    return stripHexPrefix(btcPubKey);
  }

  const provider = await fetchVaultProviderById(address);
  if (!provider) {
    throw new Error("Vault provider not found");
  }
  return stripHexPrefix(provider.btcPubKey);
}

/**
 * Get sorted vault keeper pubkeys.
 * Matches Rust backend behavior (lexicographic sort).
 */
export function getSortedVaultKeeperPubkeys(
  vaultKeepers: PayoutVaultKeeper[],
): string[] {
  return vaultKeepers.map((vk) => stripHexPrefix(vk.btcPubKey)).sort();
}

/**
 * Get sorted universal challenger pubkeys.
 * Matches Rust backend behavior (lexicographic sort).
 */
export function getSortedUniversalChallengerPubkeys(
  universalChallengers: PayoutUniversalChallenger[],
): string[] {
  return universalChallengers.map((uc) => stripHexPrefix(uc.btcPubKey)).sort();
}

/**
 * Prepare the signing context by fetching all required data from the
 * on-chain contract at the vault's locked versions.
 *
 * Never uses the GraphQL indexer for signing-critical fields — a compromised
 * indexer could substitute different signer-set versions and obtain signatures
 * over attacker-chosen graph parameters.
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
  const timelockPegin = await protocolParamsReader.getTimelockPeginByVersion(
    vault.offchainParamsVersion,
  );

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

  const vaultKeeperBtcPubkeys = getSortedVaultKeeperPubkeys(
    vaultKeepers.map((vk) => ({ btcPubKey: vk.btcPubKey })),
  );
  const universalChallengerBtcPubkeys = getSortedUniversalChallengerPubkeys(
    universalChallengers.map((uc) => ({ btcPubKey: uc.btcPubKey })),
  );

  return {
    context: {
      peginTxHex: vault.depositorSignedPeginTx,
      vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys,
      depositorBtcPubkey,
      timelockPegin,
      network: getBTCNetworkForWASM(),
      registeredPayoutScriptPubKey,
    },
    vaultProviderAddress: vault.vaultProvider,
  };
}
