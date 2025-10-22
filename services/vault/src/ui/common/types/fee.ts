/**
 * Bitcoin network fee recommendations
 *
 * All values represent fee rates in satoshis per vbyte (sat/vb).
 * These fees are dynamically fetched from mempool.space API.
 */
export type NetworkFees = {
  /** Fee for inclusion in the next block (~10 minutes) */
  fastestFee: number;

  /** Fee for inclusion within 30 minutes (~3 blocks) */
  halfHourFee: number;

  /**
   * Fee for inclusion within 1 hour (~6 blocks)
   */
  hourFee: number;

  /**
   * Economy fee - inclusion not guaranteed
   * May take hours or days depending on network conditions
   */
  economyFee: number;

  /** Minimum fee accepted by the network (usually 1 sat/vb) */
  minimumFee: number;
};
