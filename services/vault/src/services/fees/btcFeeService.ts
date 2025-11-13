/**
 * Bitcoin Fee Service
 * 
 * Handles dynamic fee calculation for Bitcoin transactions
 * using real-time network data from mempool API
 */

import { getNetworkConfigBTC } from "@babylonlabs-io/config";

/**
 * Fee rates in satoshis per vbyte for different confirmation speeds
 */
export interface BtcFeeRates {
  /** Fee for inclusion in the next block (~10 minutes) */
  fastestFee: number;
  /** Fee for inclusion within 30 minutes */
  halfHourFee: number;
  /** Fee for inclusion within 1 hour */
  hourFee: number;
  /** Economy fee - inclusion not guaranteed */
  economyFee: number;
  /** Minimum relay fee */
  minimumFee: number;
}

/**
 * Priority levels for transaction confirmation
 */
export enum FeePriority {
  FASTEST = "fastest",
  HALF_HOUR = "halfHour",
  HOUR = "hour",
  ECONOMY = "economy",
  MINIMUM = "minimum",
}

/**
 * Transaction size estimation parameters
 */
interface TxSizeParams {
  /** Number of inputs (UTXOs) */
  numInputs: number;
  /** Input script type (affects size) */
  inputType?: "P2WPKH" | "P2TR" | "P2PKH";
  /** Whether transaction has a change output */
  hasChangeOutput?: boolean;
}

/**
 * Cache for fee rates to avoid excessive API calls
 */
class FeeRateCache {
  private rates: BtcFeeRates | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_DURATION_MS = 60_000; // 1 minute

  isValid(): boolean {
    return (
      this.rates !== null &&
      Date.now() - this.lastFetch < this.CACHE_DURATION_MS
    );
  }

  set(rates: BtcFeeRates): void {
    this.rates = rates;
    this.lastFetch = Date.now();
  }

  get(): BtcFeeRates | null {
    return this.isValid() ? this.rates : null;
  }
}

const feeRateCache = new FeeRateCache();

/**
 * Fetch current fee rates from mempool API
 * 
 * @returns Current fee rates for different confirmation speeds
 * @throws Error if API request fails
 */
export async function fetchBtcFeeRates(): Promise<BtcFeeRates> {
  // Check cache first
  const cached = feeRateCache.get();
  if (cached) {
    return cached;
  }

  const btcConfig = getNetworkConfigBTC();
  const mempoolUrl = btcConfig.mempoolApiUrl;

  try {
    const response = await fetch(`${mempoolUrl}/api/v1/fees/recommended`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch fee rates: ${response.statusText}`);
    }

    const data = await response.json();
    
    const rates: BtcFeeRates = {
      fastestFee: data.fastestFee || 20,
      halfHourFee: data.halfHourFee || 10,
      hourFee: data.hourFee || 5,
      economyFee: data.economyFee || 2,
      minimumFee: data.minimumFee || 1,
    };

    // Cache the rates
    feeRateCache.set(rates);
    
    return rates;
  } catch (error) {
    console.error("Error fetching BTC fee rates:", error);
    
    // Return fallback rates if API fails
    return {
      fastestFee: 20,
      halfHourFee: 10,
      hourFee: 5,
      economyFee: 2,
      minimumFee: 1,
    };
  }
}

/**
 * Estimate the size of a peg-in transaction in vbytes
 * 
 * @param params - Transaction size parameters
 * @returns Estimated transaction size in vbytes
 */
export function estimatePeginTxSize(params: TxSizeParams): number {
  const { numInputs, inputType = "P2WPKH", hasChangeOutput = true } = params;

  // Base transaction overhead
  let size = 10.5; // version (4) + locktime (4) + overhead (2.5)

  // Input sizes by type (in vbytes for witness transactions)
  const inputSizes = {
    P2WPKH: 68,    // Witness Pay-to-Witness-PubKey-Hash
    P2TR: 57.5,    // Taproot
    P2PKH: 148,    // Legacy Pay-to-PubKey-Hash
  };

  // Add input sizes
  size += numInputs * (inputSizes[inputType] || inputSizes.P2WPKH);

  // Output sizes
  // Vault output (P2TR - Taproot)
  size += 43;

  // Change output if needed (P2WPKH)
  if (hasChangeOutput) {
    size += 31;
  }

  // Round up as fees are calculated per full vbyte
  return Math.ceil(size);
}

/**
 * Calculate the transaction fee based on size and priority
 * 
 * @param numInputs - Number of UTXOs being spent
 * @param priority - Desired confirmation speed
 * @param customFeeRate - Optional custom fee rate in sat/vbyte
 * @returns Transaction fee in satoshis
 */
export async function calculateDynamicBtcFee(
  numInputs: number,
  priority: FeePriority = FeePriority.HALF_HOUR,
  customFeeRate?: number,
): Promise<bigint> {
  // If custom rate provided, use it
  if (customFeeRate !== undefined) {
    const size = estimatePeginTxSize({ numInputs });
    return BigInt(Math.ceil(size * customFeeRate));
  }

  // Fetch current fee rates
  const rates = await fetchBtcFeeRates();

  // Select rate based on priority
  let feeRate: number;
  switch (priority) {
    case FeePriority.FASTEST:
      feeRate = rates.fastestFee;
      break;
    case FeePriority.HALF_HOUR:
      feeRate = rates.halfHourFee;
      break;
    case FeePriority.HOUR:
      feeRate = rates.hourFee;
      break;
    case FeePriority.ECONOMY:
      feeRate = rates.economyFee;
      break;
    case FeePriority.MINIMUM:
      feeRate = rates.minimumFee;
      break;
    default:
      feeRate = rates.halfHourFee;
  }

  // Estimate transaction size
  const size = estimatePeginTxSize({ numInputs });

  // Calculate fee (size in vbytes * rate in sat/vbyte)
  return BigInt(Math.ceil(size * feeRate));
}

/**
 * Get fee amount for a specific priority without size calculation
 * Useful for UI display before UTXO selection
 * 
 * @param priority - Desired confirmation speed
 * @returns Estimated fee in satoshis for a typical 1-input transaction
 */
export async function getEstimatedFeeForPriority(
  priority: FeePriority = FeePriority.HALF_HOUR,
): Promise<bigint> {
  return calculateDynamicBtcFee(1, priority);
}

/**
 * Format fee rate for display
 * 
 * @param feeRate - Fee rate in sat/vbyte
 * @returns Formatted string for UI display
 */
export function formatFeeRate(feeRate: number): string {
  return `${feeRate} sat/vB`;
}
