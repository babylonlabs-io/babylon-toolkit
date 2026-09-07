/**
 * Domain errors thrown by the reclaim service.
 *
 * @module services/reclaim/errors
 */

/**
 * Thrown when the fee would consume too much of the swept reserve — either the
 * per-vbyte rate exceeds the safety ceiling, or the absolute fee exceeds the
 * fraction cap.
 *
 * Distinct from a generic error because the caller's response differs: nothing
 * is at risk and nothing expires. The reserve simply stays where it is until
 * fee rates fall, and the UI should say so rather than presenting a failure.
 */
export class ReclaimUneconomicalError extends Error {
  /** Fee the reclaim would have paid, in satoshis. */
  public readonly feeSats: bigint;
  /** Sum of the reserves the reclaim would have swept, in satoshis. */
  public readonly sweptTotalSats: bigint;

  constructor(message: string, feeSats: bigint, sweptTotalSats: bigint) {
    super(message);
    this.name = "ReclaimUneconomicalError";
    this.feeSats = feeSats;
    this.sweptTotalSats = sweptTotalSats;
  }
}
