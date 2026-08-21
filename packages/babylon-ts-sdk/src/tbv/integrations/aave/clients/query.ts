/**
 * Aave Integration Adapter - Read operations (queries)
 *
 * Only includes functions that provide data NOT available from the indexer.
 * Most position/vault data should be fetched from the GraphQL indexer instead.
 */

import { type Address, type Hex, type PublicClient, zeroAddress } from "viem";

import type { AaveMarketPosition, PositionSizeParams } from "../types.js";
import AaveIntegrationAdapterABI from "./abis/AaveIntegrationAdapter.abi.json";

/**
 * The adapter's custom error for "this account has no position proxy".
 *
 * `AaveAdapter._getBorrowerProxy` reverts with it when `userToProxy[user]` is
 * the zero address, which is every account that has never opened a position —
 * so on a freshly deployed adapter it is the normal answer for a new user, not
 * a failure. Matched by name (the ABI carries the error entry, so viem decodes
 * it) rather than by raw selector.
 */
const NO_POSITION_ERROR_NAME = "InvalidProxyContract";

/** Bound on the `cause` walk, so a self-referencing chain cannot spin. */
const MAX_ERROR_CAUSE_DEPTH = 10;

/**
 * True when `err` is the adapter reverting because the account has no proxy.
 *
 * Matches structurally on viem's decoded `data.errorName` rather than with
 * `instanceof BaseError` / `err.walk(...)`. The SDK lists `viem` as external,
 * so a consumer can — and in this monorepo does — resolve a physically
 * different copy of the same viem version than the one bundled here (pnpm
 * keys the store path on peer versions). Errors thrown by the caller's client
 * are instances of the caller's classes, so `instanceof` silently returns
 * false across that boundary and the revert would escape as an opaque throw.
 *
 * Narrow on purpose: any other revert, and every transport/RPC failure, must
 * keep propagating. Reporting those as "no position" would turn an infra
 * outage into a silent, wrong answer for callers that gate signing on it.
 */
function isNoPositionRevert(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH; depth++) {
    if (typeof current !== "object" || current === null) return false;
    const { data, cause } = current as {
      data?: { errorName?: unknown };
      cause?: unknown;
    };
    if (data?.errorName === NO_POSITION_ERROR_NAME) return true;
    if (cause === undefined || cause === current) return false;
    current = cause;
  }
  return false;
}

/**
 * Get a position by user address.
 *
 * The adapter resolves the user's proxy contract and collateralized vault IDs.
 *
 * NOTE: Prefer using the indexer (fetchAavePositionWithCollaterals) for position data.
 * This function is only needed when you need data not available in the indexer,
 * or when you need to verify on-chain state.
 *
 * @param publicClient - Viem public client for reading contracts
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param user - User's Ethereum address
 * @returns Market position data or null if position doesn't exist
 */
export async function getPosition(
  publicClient: PublicClient,
  contractAddress: Address,
  user: Address,
): Promise<AaveMarketPosition | null> {
  type PositionResult = {
    proxyContract: Address;
    vaultIds: Hex[];
    totalCollateralBTC: bigint;
  };

  let result: unknown;
  try {
    result = await publicClient.readContract({
      address: contractAddress,
      abi: AaveIntegrationAdapterABI,
      functionName: "getPosition",
      args: [user],
    });
  } catch (err) {
    // "No proxy yet" is a revert, not a zero-address return value, so it has
    // to be caught here for this function to honour its documented contract.
    if (isNoPositionRevert(err)) return null;
    throw err;
  }

  const position = result as PositionResult;

  // Defence in depth: the adapter reverts rather than returning a zero proxy,
  // so this should be unreachable. Kept because the return value is external
  // input — a zero proxy must never reach a caller as a real position.
  if (position.proxyContract === zeroAddress) {
    return null;
  }

  return {
    proxyContract: position.proxyContract,
    vaultIds: position.vaultIds,
    totalCollateralBTC: position.totalCollateralBTC,
  };
}

/**
 * Get position size parameters from the adapter contract.
 *
 * Returns the maximum BTC position size and maximum vaults per position
 * as configured on-chain.
 *
 * @param publicClient - Viem public client for reading contracts
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @returns Position size parameters (maxPositionBTC, maxVaultsPerPosition)
 */
export async function getPositionSizeParams(
  publicClient: PublicClient,
  contractAddress: Address,
): Promise<PositionSizeParams> {
  const result = await publicClient.readContract({
    address: contractAddress,
    abi: AaveIntegrationAdapterABI,
    functionName: "getPositionSizeParams",
  });

  const [maxPositionBTC, maxVaultsPerPosition] = result as [bigint, bigint];

  return {
    maxPositionBTC,
    maxVaultsPerPosition,
  };
}
