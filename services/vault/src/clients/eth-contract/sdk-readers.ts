/**
 * SDK Reader Factory
 *
 * Provides cached SDK contract reader instances per chain id, with a
 * short TTL so a governance upgrade or a network switch is picked up
 * without requiring a page reload.
 *
 * Resolves ProtocolParams and ApplicationRegistry addresses from
 * BTCVaultRegistry on first use, then caches the reader instances.
 * A failed refresh falls back to the cached readers for at most
 * READER_CACHE_MAX_STALE_MS after the last successful resolve.
 */

import {
  type ProtocolAddresses,
  resolveProtocolAddresses,
  ViemOperationKeyReader,
  ViemProtocolParamsReader,
  ViemUniversalChallengerReader,
  ViemVaultKeeperReader,
  ViemVaultRegistryReader,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { PublicClient } from "viem";

import { StaleProtocolAddressesError } from "@/utils/errors/staleProtocolAddresses";

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

/**
 * Maximum age of the last successful address resolve. Readers older than
 * this are refused on every path, whatever the call pattern. Inside it, a
 * failed refresh falls back to the cached readers as a transient RPC
 * failure; past it, only a successful resolve returns readers. These
 * readers feed transaction construction, so stale addresses are refused
 * rather than extended.
 */
const READER_CACHE_MAX_STALE_MS = 2 * READER_CACHE_TTL_MS;

interface ProtocolReaders {
  protocolParamsReader: ViemProtocolParamsReader;
  vaultKeeperReader: ViemVaultKeeperReader;
  universalChallengerReader: ViemUniversalChallengerReader;
  operationKeyReader: ViemOperationKeyReader;
}

interface ResolvedReaders extends ProtocolReaders {
  /** Last successful address resolve. Set only on success. */
  resolvedAt: number;
  /** Last refresh attempt, successful or not. Gates the TTL. */
  refreshedAt: number;
}

function buildReaders(
  publicClient: PublicClient,
  addresses: ProtocolAddresses,
): ProtocolReaders {
  return {
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
    // RFC-006 operation-key resolution spans all three registries, so it
    // is built here alongside the others rather than constructed ad hoc —
    // it needs the same resolved ProtocolParams / ApplicationRegistry
    // addresses.
    operationKeyReader: new ViemOperationKeyReader(publicClient, {
      btcVaultRegistry: CONTRACTS.BTC_VAULT_REGISTRY,
      applicationRegistry: addresses.applicationRegistry,
      protocolParams: addresses.protocolParams,
    }),
  };
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
  const chainId = publicClient.chain.id;

  const cached = resolvedReadersCache.get(chainId);
  const now = Date.now();
  if (
    cached &&
    now - cached.refreshedAt < READER_CACHE_TTL_MS &&
    now - cached.resolvedAt < READER_CACHE_MAX_STALE_MS
  ) {
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

      const resolvedNow = Date.now();
      const resolved: ResolvedReaders = {
        ...buildReaders(publicClient, addresses),
        resolvedAt: resolvedNow,
        refreshedAt: resolvedNow,
      };

      resolvedReadersCache.set(chainId, resolved);
      return resolved;
    } catch (error) {
      // No cached entry: nothing to fall back to.
      if (!cached) throw error;

      // Stale-while-revalidate, bounded by the age of the last successful
      // resolve. Inside READER_CACHE_MAX_STALE_MS, hand back the cached readers
      // rather than block the UI on a transient RPC failure, and bump
      // `refreshedAt` so a sustained outage retries once per TTL window. Past
      // it, refuse: the fast path also rejects the entry by age, so every later
      // call retries the resolve and the first success restores the cache.
      const ageMs = Date.now() - cached.resolvedAt;
      if (ageMs < READER_CACHE_MAX_STALE_MS) {
        cached.refreshedAt = Date.now();
        return cached;
      }
      throw new StaleProtocolAddressesError(
        chainId,
        ageMs,
        READER_CACHE_MAX_STALE_MS,
        { cause: error },
      );
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
 * Get the RFC-006 operation-key reader (contract-based).
 *
 * Only valid against an RFC-006 registry: on one that predates RFC-006 these
 * getters do not exist and every call reverts on selector mismatch. Unlike the
 * extended `getBtcVaultProtocolInfo` read, that failure is loud.
 */
export async function getOperationKeyReader(): Promise<ViemOperationKeyReader> {
  return (await getResolvedReaders()).operationKeyReader;
}

/**
 * Readers built from the registry pointers at `blockNumber`. Uncached with no
 * fallback, so a pinned build never reads through `latest`-resolved addresses.
 */
export async function getReadersAtBlock(
  blockNumber: bigint,
): Promise<ProtocolReaders> {
  const publicClient = ethClient.getPublicClient();
  const addresses = await resolveProtocolAddresses(
    publicClient,
    CONTRACTS.BTC_VAULT_REGISTRY,
    blockNumber,
  );
  return buildReaders(publicClient, addresses);
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
