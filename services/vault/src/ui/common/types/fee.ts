/**
 * Bitcoin network fee recommendations (sat/vbyte) from mempool.space API.
 */
export type NetworkFees = {
  /** Next block (~10 min) */
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  /** Economy (no time guarantee) */
  economyFee: number;
  /** Minimum network fee */
  minimumFee: number;
};
