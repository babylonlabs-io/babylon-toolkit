/**
 * Data transformation utilities for converting blockchain data to UI formats
 */

import type { Hex, Address } from 'viem';
import type { PeginRequest, MorphoUserPosition, MorphoMarketSummary } from '../clients/eth-contract';
import type { VaultActivity } from '../mockData/vaultActivities';

/**
 * Bitcoin icon as data URI (orange bitcoin logo)
 */
const BITCOIN_ICON_DATA_URI = "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%23FF7C2A' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z'/%3E%3C/svg%3E";

/**
 * Satoshis per Bitcoin constant
 */
const SATOSHIS_PER_BTC = 100_000_000n;

/**
 * Status mapping from contract enum to UI format
 */
const STATUS_MAP = {
  0: { label: 'Pending', variant: 'pending' as const },
  1: { label: 'Verified', variant: 'pending' as const },
  2: { label: 'Active', variant: 'active' as const },
} as const;

/**
 * Format BTC amount from satoshis to BTC with proper decimals
 * @param satoshis - Amount in satoshis (smallest Bitcoin unit)
 * @returns Formatted BTC amount as string (e.g., "1.50")
 */
export function formatBTCAmount(satoshis: bigint): string {
  // Convert to BTC by dividing by 100,000,000
  const btc = Number(satoshis) / Number(SATOSHIS_PER_BTC);
  
  // Format with up to 8 decimal places, removing trailing zeros
  return btc.toFixed(8).replace(/\.?0+$/, '') || '0';
}

/**
 * Get status label and variant from contract status number
 * @param status - Status number from contract (0=Pending, 1=Verified, 2=Active)
 * @returns Status object with label and variant for UI
 */
export function getStatusInfo(status: number): { label: string; variant: 'active' | 'inactive' | 'pending' | 'default' } {
  // Defensive check - return default if status is unknown
  if (status in STATUS_MAP) {
    return STATUS_MAP[status as keyof typeof STATUS_MAP];
  }
  
  return { label: 'Unknown', variant: 'default' };
}

/**
 * Format vault provider address to display name
 * TODO: Implement proper provider registry lookup
 * @param providerAddress - Ethereum address of vault provider
 * @returns Provider display name
 */
export function formatProviderName(providerAddress: Address): string {
  // For now, show shortened address
  // TODO: Look up provider name from registry or API
  const shortened = `${providerAddress.slice(0, 6)}...${providerAddress.slice(-4)}`;
  return `Provider ${shortened}`;
}

/**
 * Convert borrow shares to borrowed assets amount
 * Uses the market's totalBorrowShares and totalBorrowAssets for conversion
 * @param borrowShares - User's borrow shares
 * @param totalBorrowShares - Total borrow shares in market
 * @param totalBorrowAssets - Total borrowed assets in market
 * @returns Borrowed assets amount
 */
function convertBorrowSharesToAssets(
  borrowShares: bigint,
  totalBorrowShares: bigint,
  totalBorrowAssets: bigint
): bigint {
  if (totalBorrowShares === 0n) return 0n;
  return (borrowShares * totalBorrowAssets) / totalBorrowShares;
}

/**
 * Format USDC amount from wei (6 decimals) to human-readable string
 * @param amount - Amount in smallest unit (6 decimals for USDC)
 * @returns Formatted amount as string (e.g., "1000.50")
 */
function formatUSDCAmount(amount: bigint): string {
  const USDC_DECIMALS = 1_000_000n; // 10^6
  const usdcAmount = Number(amount) / Number(USDC_DECIMALS);

  // Format with up to 2 decimal places for USD
  return usdcAmount.toFixed(2).replace(/\.?0+$/, '') || '0';
}

/**
 * Calculate enriched borrowing data from position and market
 * @param morphoPosition - User's morpho position
 * @param morphoMarket - Morpho market data
 * @param collateralBTC - Collateral amount in BTC
 * @param btcPriceUSD - BTC price in USD from oracle
 * @returns Enriched borrowing data with LTV calculations
 */
function calculateBorrowingData(
  morphoPosition: MorphoUserPosition,
  morphoMarket: MorphoMarketSummary,
  collateralBTC: string,
  btcPriceUSD: { price: bigint; decimals: number }
) {
  console.log('[calculateBorrowingData] Input data:', {
    borrowShares: morphoPosition.borrowShares.toString(),
    collateral: morphoPosition.collateral.toString(),
    totalBorrowShares: morphoMarket.totalBorrowShares.toString(),
    totalBorrowAssets: morphoMarket.totalBorrowAssets.toString(),
    collateralBTC,
    oracleAddress: morphoMarket.oracle,
    btcPrice: btcPriceUSD.price.toString(),
    btcPriceDecimals: btcPriceUSD.decimals,
  });

  // Convert borrow shares to actual borrowed amount
  const borrowedAssets = convertBorrowSharesToAssets(
    morphoPosition.borrowShares,
    morphoMarket.totalBorrowShares,
    morphoMarket.totalBorrowAssets
  );

  console.log('[calculateBorrowingData] Borrowed assets (raw):', borrowedAssets.toString());

  const borrowedAmount = formatUSDCAmount(borrowedAssets);

  console.log('[calculateBorrowingData] Borrowed amount (formatted):', borrowedAmount);

  // Calculate current LTV using BTC price
  // LTV = (borrowed USD / (collateral BTC * BTC price USD)) * 100
  // collateral is in wei (18 decimals), btcPrice has its own decimals, borrowedAssets is in USDC wei (6 decimals)

  // Convert collateral from wei to BTC (divide by 10^18)
  const collateralBTCAmount = morphoPosition.collateral / 10n**18n;

  // Convert BTC price to USD (divide by 10^decimals)
  const btcPriceInUSD = Number(btcPriceUSD.price) / (10 ** btcPriceUSD.decimals);

  // Calculate collateral value in USD
  const collateralValueUSD = Number(collateralBTCAmount) * btcPriceInUSD;

  // Convert borrowed assets from USDC wei to USD (divide by 10^6)
  const borrowedUSD = Number(borrowedAssets) / 1_000_000;

  // Calculate LTV percentage
  const currentLTV = collateralValueUSD > 0 ? (borrowedUSD / collateralValueUSD) * 100 : 0;

  console.log('[calculateBorrowingData] LTV calculation:', {
    collateralBTC: collateralBTCAmount.toString(),
    btcPriceUSD: btcPriceInUSD,
    collateralValueUSD,
    borrowedUSD,
    currentLTV,
  });

  return {
    borrowedAmount,
    borrowedSymbol: 'USDC',
    currentLTV: Number(currentLTV.toFixed(2)),
    maxLTV: morphoMarket.lltvPercent,
  };
}

/**
 * Transform PeginRequest data from contract to VaultActivity UI format
 * @param peginRequest - Pegin request data from BTCVaultsManager contract
 * @param txHash - Transaction hash used as unique ID
 * @param onBorrowClick - Callback function for borrow action
 * @param morphoPosition - Optional morpho position data (undefined if vault not minted yet)
 * @param morphoMarket - Optional morpho market data (undefined if vault not minted yet)
 * @param btcPriceUSD - Optional BTC price in USD (undefined if vault not minted yet)
 * @returns VaultActivity object ready for UI rendering
 */
export function transformPeginToActivity(
  peginRequest: PeginRequest,
  txHash: Hex,
  onBorrowClick: (activity: VaultActivity) => void,
  morphoPosition?: MorphoUserPosition,
  morphoMarket?: MorphoMarketSummary,
  btcPriceUSD?: { price: bigint; decimals: number }
): VaultActivity {
  // Convert amount from satoshis to BTC
  const btcAmount = formatBTCAmount(peginRequest.amount);

  // Format provider
  const providerName = formatProviderName(peginRequest.vaultProvider);

  // Check if user has already borrowed (has borrow shares > 0)
  const hasBorrowed = morphoPosition && morphoPosition.borrowShares > 0n;

  // Get status info - override to "Borrowing" if vault has active borrows
  const baseStatusInfo = getStatusInfo(peginRequest.status);
  const statusInfo = hasBorrowed
    ? { label: 'Borrowing', variant: 'active' as const }
    : baseStatusInfo;

  // Calculate enriched borrowing data if we have position, market data, and BTC price
  const borrowingData = morphoPosition && morphoMarket && btcPriceUSD && hasBorrowed
    ? calculateBorrowingData(morphoPosition, morphoMarket, btcAmount, btcPriceUSD)
    : undefined;

  // Create market data if we have morpho market and BTC price
  const marketData = morphoMarket && btcPriceUSD
    ? {
        btcPriceUSD: Number(btcPriceUSD.price) / (10 ** btcPriceUSD.decimals),
        lltvPercent: morphoMarket.lltvPercent,
      }
    : undefined;

  // Create VaultActivity object
  const activity: VaultActivity = {
    id: txHash,
    txHash,
    collateral: {
      amount: btcAmount,
      symbol: 'BTC',
      icon: BITCOIN_ICON_DATA_URI,
    },
    status: {
      label: statusInfo.label,
      variant: statusInfo.variant,
    },
    providers: [
      {
        id: peginRequest.vaultProvider,
        name: providerName,
        icon: undefined, // TODO: Add provider icon support
      },
    ],
    action: {
      label: hasBorrowed ? 'Borrowed' : 'Borrow USDC',
      onClick: hasBorrowed ? () => {} : () => onBorrowClick(activity),
    },
    morphoPosition: morphoPosition ? {
      collateral: morphoPosition.collateral,
      borrowShares: morphoPosition.borrowShares,
      borrowed: 0n, // Not available from morpho position, calculated separately
    } : undefined,
    borrowingData,
    marketData,
    // TODO: Add position date from blockchain timestamp
    positionDate: undefined,
  };

  return activity;
}

/**
 * Transform multiple PeginRequests to VaultActivities
 * @param peginRequestsWithHashes - Array of tuples containing pegin request data and transaction hash
 * @param onBorrowClick - Callback function for borrow action
 * @returns Array of VaultActivity objects
 */
export function transformPeginRequestsToActivities(
  peginRequestsWithHashes: Array<{ peginRequest: PeginRequest; txHash: Hex }>,
  onBorrowClick: (activity: VaultActivity) => void
): VaultActivity[] {
  return peginRequestsWithHashes.map(({ peginRequest, txHash }) =>
    transformPeginToActivity(peginRequest, txHash, onBorrowClick)
  );
}
