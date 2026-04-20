/**
 * Domain errors thrown by the refund service.
 *
 * @module services/refund/errors
 */

import type { Hex } from "viem";

/**
 * Thrown when the broadcast transport rejects the refund tx because the CSV
 * timelock has not yet matured (BIP68 non-final). Callers can surface a
 * friendly "wait until block N" message; the original transport error is
 * available via {@link cause}.
 */
export class BIP68NotMatureError extends Error {
  public readonly vaultId: Hex;
  public override readonly cause: Error;

  constructor(vaultId: Hex, cause: Error) {
    super(`Refund not yet mature (BIP68 not final): ${cause.message}`);
    this.name = "BIP68NotMatureError";
    this.vaultId = vaultId;
    this.cause = cause;
  }
}
