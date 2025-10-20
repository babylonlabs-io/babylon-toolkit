/**
 * Pegin Service - Business logic layer
 *
 * Orchestrates pegin request operations and transformations.
 * This layer sits between React hooks and low-level clients.
 */

import type { Address, Hex } from 'viem';
import { BTCVaultsManager, VaultController, Morpho, MorphoOracle } from '../../clients/eth-contract';
import type { PeginRequest, MorphoUserPosition, MorphoMarketSummary, VaultMetadata } from '../../clients/eth-contract';

/**
 * Pegin request with transaction hash
 */
export interface PeginRequestWithTxHash {
  /** The pegin request data */
  peginRequest: PeginRequest;
  /** Transaction hash */
  txHash: Hex;
}

/**
 * Pegin request with vault metadata (for deposit tab)
 * Shows vault status without full Morpho position details
 */
export interface PeginRequestWithVaultMetadata {
  /** The pegin request data */
  peginRequest: PeginRequest;
  /** Transaction hash */
  txHash: Hex;
  /** Vault metadata (undefined if vault not yet minted) */
  vaultMetadata?: VaultMetadata;
}

/**
 * Pegin request with morpho position data
 */
export interface PeginRequestWithMorpho {
  /** The pegin request data */
  peginRequest: PeginRequest;
  /** Transaction hash */
  txHash: Hex;
  /** Vault metadata (undefined if vault not yet minted) */
  vaultMetadata?: VaultMetadata;
  /** Morpho position data (undefined if vault not yet minted) */
  morphoPosition?: MorphoUserPosition;
  /** Morpho market data */
  morphoMarket: MorphoMarketSummary;
  /** BTC price in USD as a number from Morpho oracle */
  btcPriceUSD: number;
}

/**
 * Get all pegin requests for a depositor with full details
 *
 * Composite operation that:
 * 1. Fetches all pegin transaction hashes for depositor
 * 2. Bulk fetches detailed pegin request data in a single multicall (optimized)
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @returns Array of pegin requests with transaction hashes
 */
export async function getPeginRequestsWithDetails(
  depositorAddress: Address,
  btcVaultsManagerAddress: Address
): Promise<PeginRequestWithTxHash[]> {
  // Step 1: Get all transaction hashes for this depositor
  const txHashes: Hex[] = await BTCVaultsManager.getDepositorPeginRequests(
    btcVaultsManagerAddress,
    depositorAddress
  );

  // Early return if no pegin requests found
  if (txHashes.length === 0) {
    return [];
  }

  // Step 2: Bulk fetch detailed pegin request data for all hashes in a single multicall
  // This is much more efficient than individual calls in Promise.all
  const peginRequestsArray = await BTCVaultsManager.getPeginRequestsBulk(
    btcVaultsManagerAddress,
    txHashes
  );

  // Step 3: Combine with transaction hashes, filtering out undefined results
  const peginRequestsWithDetails = txHashes
    .map((txHash, index) => {
      const peginRequest = peginRequestsArray[index];
      if (!peginRequest) {
        return null;
      }
      return { peginRequest, txHash };
    })
    .filter((item): item is PeginRequestWithTxHash => item !== null);

  return peginRequestsWithDetails;
}

/**
 * Get all pegin requests with vault metadata
 *
 * Composite operation that:
 * 1. Fetches all pegin requests with details
 * 2. Bulk fetches vault metadata for all pegins in a single multicall (optimized)
 * 3. Does NOT fetch full Morpho position data (for performance)
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @param vaultControllerAddress - VaultController contract address
 * @returns Array of pegin requests with vault metadata
 */
export async function getPeginRequestsWithVaultMetadata(
  depositorAddress: Address,
  btcVaultsManagerAddress: Address,
  vaultControllerAddress: Address
): Promise<PeginRequestWithVaultMetadata[]> {
  // Step 1: Get basic pegin request data
  const peginRequests = await getPeginRequestsWithDetails(depositorAddress, btcVaultsManagerAddress);

  if (peginRequests.length === 0) {
    return [];
  }

  // Step 2: Bulk fetch vault metadata for all pegins in a single multicall
  // This is much more efficient than individual calls in Promise.all
  const txHashes = peginRequests.map(({ txHash }) => txHash);
  const vaultMetadataArray = await VaultController.getVaultMetadataBulk(vaultControllerAddress, txHashes);

  // Step 3: Combine pegin requests with their vault metadata
  const peginRequestsWithMetadata = peginRequests.map(({ peginRequest, txHash }, index) => ({
    peginRequest,
    txHash,
    vaultMetadata: vaultMetadataArray[index],
  }));

  return peginRequestsWithMetadata;
}

/**
 * Get all pegin requests with Morpho position data
 *
 * Composite operation that:
 * 1. Fetches all pegin requests with details
 * 2. Fetches Morpho market data and BTC price (once, shared across all pegins)
 * 3. Bulk fetches vault metadata for all pegins in a single multicall
 * 4. Bulk fetches morpho positions for all vaults with metadata
 * 5. Returns pegin data with morpho position (undefined if vault not minted yet)
 *    but always includes market data and BTC price
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @param vaultControllerAddress - VaultController contract address
 * @param marketId - Morpho market ID
 * @returns Array of pegin requests with morpho position data
 */
export async function getPeginRequestsWithMorpho(
  depositorAddress: Address,
  btcVaultsManagerAddress: Address,
  vaultControllerAddress: Address,
  marketId: string | bigint
): Promise<PeginRequestWithMorpho[]> {
  // Step 1: Get basic pegin request data
  const peginRequests = await getPeginRequestsWithDetails(depositorAddress, btcVaultsManagerAddress);

  if (peginRequests.length === 0) {
    return [];
  }

  // Step 2: Fetch market data and BTC price (independent of vault status)
  const morphoMarket = await Morpho.getMarketById(marketId);
  const oraclePrice = await MorphoOracle.getOraclePrice(morphoMarket.oracle);
  const btcPriceUSD = MorphoOracle.convertOraclePriceToUSD(oraclePrice);

  // Step 3: Bulk fetch vault metadata for all pegins in a single multicall
  const txHashes = peginRequests.map(({ txHash }) => txHash);
  const vaultMetadataArray = await VaultController.getVaultMetadataBulk(vaultControllerAddress, txHashes);

  // Step 4: Extract proxy contract addresses from vault metadata (for vaults that exist)
  // Keep track of indices for mapping back to pegin requests
  const proxyAddressesWithIndices: { proxyAddress: Address; index: number }[] = [];
  vaultMetadataArray.forEach((metadata, index) => {
    if (metadata) {
      proxyAddressesWithIndices.push({
        proxyAddress: metadata.proxyContract,
        index,
      });
    }
  });

  // Step 5: Bulk fetch morpho positions for all proxy contracts
  const morphoPositionsBulk = proxyAddressesWithIndices.length > 0
    ? await Morpho.getUserPositionsBulk(
        marketId,
        proxyAddressesWithIndices.map(({ proxyAddress }) => proxyAddress)
      )
    : [];

  // Step 6: Map morpho positions back to their indices
  const morphoPositionsByIndex = new Map<number, typeof morphoPositionsBulk[0]>();
  proxyAddressesWithIndices.forEach(({ index }, bulkIndex) => {
    morphoPositionsByIndex.set(index, morphoPositionsBulk[bulkIndex]);
  });

  // Step 7: Combine all data
  const peginRequestsWithMorpho = peginRequests.map(({ peginRequest, txHash }, index) => ({
    peginRequest,
    txHash,
    vaultMetadata: vaultMetadataArray[index],
    morphoPosition: morphoPositionsByIndex.get(index),
    morphoMarket,
    btcPriceUSD,
  }));

  return peginRequestsWithMorpho;
}

/**
 * Available collateral for borrowing
 */
export interface AvailableCollateral {
  /** Transaction hash of the pegin request (also serves as vault ID) */
  txHash: Hex;
  /** Amount of BTC deposited */
  amount: string;
  /** Token symbol (e.g., "BTC") */
  symbol: string;
  /** Token icon URL */
  icon?: string;
}

/**
 * Get available collaterals for borrowing
 *
 * Fetches all pegin requests and filters for those with status "Available" (status === 2).
 * These are pegins that have been verified by vault providers and are ready to be used as collateral,
 * but are NOT yet in a borrowing position (not borrowed against yet).
 *
 * Status flow:
 * - 0 = Pending: Waiting for vault provider verification
 * - 1 = Verified: Vault provider has signed, waiting for BTC confirmation
 * - 2 = Available: BTC confirmed, ready to use as collateral (THIS IS WHAT WE WANT)
 * - 3 = InPosition: Already being used in a Morpho borrowing position
 * - 4 = Expired: Pegin request expired
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @param vaultControllerAddress - VaultController contract address
 * @returns Array of available collaterals that can be selected for borrowing
 */
export async function getAvailableCollaterals(
  depositorAddress: Address,
  btcVaultsManagerAddress: Address,
  vaultControllerAddress: Address
): Promise<AvailableCollateral[]> {
  // Fetch all pegin requests with vault metadata
  const peginRequests = await getPeginRequestsWithVaultMetadata(
    depositorAddress,
    btcVaultsManagerAddress,
    vaultControllerAddress
  );

  // Filter for pegins with status "Available" (status === 2)
  // These are pegins that:
  // 1. Have been verified by vault provider
  // 2. Have BTC confirmation on-chain
  // 3. Are NOT yet used in a borrowing position (status 3 would mean "InPosition")
  const availableCollaterals = peginRequests
    .filter(({ peginRequest }) => peginRequest.status === 2)
    .map(({ txHash, peginRequest }) => ({
      txHash,
      amount: (Number(peginRequest.amount) / 1e8).toFixed(8), // Convert satoshis to BTC
      symbol: 'BTC',
      icon: undefined, // Will be set by UI layer if needed
    }));

  return availableCollaterals;
}
