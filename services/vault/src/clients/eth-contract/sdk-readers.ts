/**
 * SDK Reader Factory
 *
 * Provides cached SDK contract reader instances per chain id, with a
 * short TTL so a governance upgrade or a network switch is picked up
 * without requiring a page reload.
 *
 * Resolves ProtocolParams and ApplicationRegistry addresses from
 * BTCVaultRegistry on first use, then caches the reader instances.
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

/**
 * TTL for the resolved-readers cache.
 * Short enough that a governance upgrade (re-pointing
 * `BTCVaultRegistry.protocolParams()` / `applicationRegistry()`) propagates
 * without a page reload; long enough to keep RPC traffic low for normal
 * read-heavy workflows.
 */
const READER_CACHE_TTL_MS = 5 * 60 * 1000;

interface ResolvedReaders {
  protocolParamsReader: ViemProtocolParamsReader;
  vaultKeeperReader: ViemVaultKeeperReader;
  universalChallengerReader: ViemUniversalChallengerReader;
  fetchedAt: number;
}

/**
 * Cache of resolved readers, keyed by chainId. Per-chain keying ensures a
 * mid-session network switch yields a fresh resolution against the new
 * chain's BTCVaultRegistry rather than reusing addresses pinned to the
 * previous chain.
 */
const resolvedReadersCache = new Map<number, ResolvedReaders>();

/**
 * In-flight resolve, keyed by chainId, so concurrent first-callers dedupe
 * to a single RPC round-trip.
 */
const initPromises = new Map<number, Promise<ResolvedReaders>>();

const vaultRegistryReadersByChainId = new Map<
  number,
  ViemVaultRegistryReader
>();

async function getResolvedReaders(): Promise<ResolvedReaders> {
  const publicClient = ethClient.getPublicClient();
  const chainId = await publicClient.getChainId();

  const cached = resolvedReadersCache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < READER_CACHE_TTL_MS) {
    return cached;
  }

  const inFlight = initPromises.get(chainId);
  if (inFlight) return inFlight;

  const pending = (async (): Promise<ResolvedReaders> => {
    try {
      const addresses = await resolveProtocolAddresses(
        publicClient,
        CONTRACTS.BTC_VAULT_REGISTRY,
      );

      const resolved: ResolvedReaders = {
        protocolParamsReader: new ViemProtocolParamsReader(
          publicClient,
          addresses.protocolParams,
        ),
        vaultKeeperReader: new ViemVaultKeeperReader(
          publicClient,
          addresses.applicationRegistry,
        ),
        universalChallengerReader: new ViemUniversalChallengerReader(
          publicClient,
          addresses.protocolParams,
        ),
        fetchedAt: Date.now(),
      };

      resolvedReadersCache.set(chainId, resolved);
      return resolved;
    } catch (error) {
      // Stale-while-revalidate: if a re-resolve fails but we have a
      // previously fetched (now-expired) entry, hand that back rather
      // than block the UI on a transient RPC failure. Governance
      // upgrades are rare; transient RPC errors are not.
      //
      // Bump `fetchedAt` so we don't hammer RPC on every subsequent
      // call during a sustained outage — the next refresh attempt is
      // gated by the same TTL window.
      if (cached) {
        cached.fetchedAt = Date.now();
        return cached;
      }
      throw error;
    } finally {
      initPromises.delete(chainId);
    }
  })();

  initPromises.set(chainId, pending);
  return pending;
}

/** Test-only: clear all caches so each test starts from a clean slate. */
export function _resetSdkReadersCacheForTests(): void {
  resolvedReadersCache.clear();
  initPromises.clear();
  vaultRegistryReadersByChainId.clear();
}

/**
 * Get the protocol params reader (contract-based).
 * Use for transaction-critical timelock and offchain param lookups.
 */
export async function getProtocolParamsReader(): Promise<ViemProtocolParamsReader> {
  return (await getResolvedReaders()).protocolParamsReader;
}

/**
 * Get the vault keeper reader (contract-based).
 * Use for transaction-critical versioned keeper lookups.
 */
export async function getVaultKeeperReader(): Promise<ViemVaultKeeperReader> {
  return (await getResolvedReaders()).vaultKeeperReader;
}

/**
 * Get the universal challenger reader (contract-based).
 * Use for transaction-critical versioned challenger lookups.
 */
export async function getUniversalChallengerReader(): Promise<ViemUniversalChallengerReader> {
  return (await getResolvedReaders()).universalChallengerReader;
}

/**
 * Get the vault registry reader (contract-based), keyed by the active
 * chain's id. Construction is sync because the BTCVaultRegistry address
 * is known statically via CONTRACTS.
 */
export function getVaultRegistryReader(): ViemVaultRegistryReader {
  const publicClient = ethClient.getPublicClient();
  const chainId = publicClient.chain?.id;
  if (chainId == null) {
    // No chain pinned on the public client (test/early-init path) — fall
    // back to a single shared reader keyed by `0`, matching the previous
    // pre-chain-id behavior.
    let shared = vaultRegistryReadersByChainId.get(0);
    if (!shared) {
      shared = new ViemVaultRegistryReader(
        publicClient,
        CONTRACTS.BTC_VAULT_REGISTRY,
      );
      vaultRegistryReadersByChainId.set(0, shared);
    }
    return shared;
  }

  let reader = vaultRegistryReadersByChainId.get(chainId);
  if (!reader) {
    reader = new ViemVaultRegistryReader(
      publicClient,
      CONTRACTS.BTC_VAULT_REGISTRY,
    );
    vaultRegistryReadersByChainId.set(chainId, reader);
  }
  return reader;
}
