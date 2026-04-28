/**
 * SDK Reader Factory
 *
 * Provides lazy-initialized singleton instances of SDK contract readers
 * for transaction-critical paths (payout signing, refund tx construction).
 *
 * Resolves ProtocolParams and ApplicationRegistry addresses from
 * BTCVaultRegistry on first use, then caches the reader instances.
 *
 * Display-only data (ProtocolParamsContext, provider listings) continues
 * to use the existing GraphQL/contract modules for performance.
 */

import {
  resolveProtocolAddresses,
  ViemProtocolParamsReader,
  ViemUniversalChallengerReader,
  ViemVaultKeeperReader,
  ViemVaultRegistryReader,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { CONTRACTS } from "../../config/contracts";

import { ethClient } from "./client";

let protocolParamsReader: ViemProtocolParamsReader | null = null;
let vaultKeeperReader: ViemVaultKeeperReader | null = null;
let universalChallengerReader: ViemUniversalChallengerReader | null = null;
let vaultRegistryReader: ViemVaultRegistryReader | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Resolve addresses and construct all readers. Called once on first use.
 * Uses promise memoization to prevent redundant RPC calls when multiple
 * getters are called concurrently (e.g. Promise.all in refund service).
 * Resets on failure so transient RPC errors can be retried.
 */
async function ensureReaders(): Promise<void> {
  if (protocolParamsReader && vaultKeeperReader && universalChallengerReader) {
    return;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const publicClient = ethClient.getPublicClient();
    const addresses = await resolveProtocolAddresses(
      publicClient,
      CONTRACTS.BTC_VAULT_REGISTRY,
    );

    // Construct all readers before assigning to singletons (atomic swap)
    const ppReader = new ViemProtocolParamsReader(
      publicClient,
      addresses.protocolParams,
    );
    const vkReader = new ViemVaultKeeperReader(
      publicClient,
      addresses.applicationRegistry,
    );
    const ucReader = new ViemUniversalChallengerReader(
      publicClient,
      addresses.protocolParams,
    );

    protocolParamsReader = ppReader;
    vaultKeeperReader = vkReader;
    universalChallengerReader = ucReader;
  })().catch((error) => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}

/**
 * Get the protocol params reader (contract-based).
 * Use for transaction-critical timelock and offchain param lookups.
 */
export async function getProtocolParamsReader(): Promise<ViemProtocolParamsReader> {
  await ensureReaders();
  return protocolParamsReader!;
}

/**
 * Get the vault keeper reader (contract-based).
 * Use for transaction-critical versioned keeper lookups.
 */
export async function getVaultKeeperReader(): Promise<ViemVaultKeeperReader> {
  await ensureReaders();
  return vaultKeeperReader!;
}

/**
 * Get the universal challenger reader (contract-based).
 * Use for transaction-critical versioned challenger lookups.
 */
export async function getUniversalChallengerReader(): Promise<ViemUniversalChallengerReader> {
  await ensureReaders();
  return universalChallengerReader!;
}

/**
 * Get the vault registry reader (contract-based).
 *
 * Synchronous construction: the BTCVaultRegistry address is known statically
 * via CONTRACTS, so this reader does NOT depend on `resolveProtocolAddresses`
 * and skips the shared init path. That keeps activation a true one-RPC
 * operation on cold start (just `getBtcVaultProtocolInfo`).
 */
export function getVaultRegistryReader(): ViemVaultRegistryReader {
  if (!vaultRegistryReader) {
    vaultRegistryReader = new ViemVaultRegistryReader(
      ethClient.getPublicClient(),
      CONTRACTS.BTC_VAULT_REGISTRY,
    );
  }
  return vaultRegistryReader;
}
