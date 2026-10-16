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

/**
 * Thrown when the broadcast transport relays bitcoind `-25` (a general
 * transaction error, usually missing or already spent inputs) or `-27` (this
 * transaction is already in the chain). `signedTxHex` is the exact
 * transaction that was broadcast, so callers can re-probe the HTLC outpoint
 * and attribute the spender. The original transport error is available via
 * {@link cause}.
 */
export class RefundBroadcastRejectedError extends Error {
  public readonly code: -25 | -27;
  public readonly vaultId: Hex;
  public readonly signedTxHex: string;
  public override readonly cause: Error;

  constructor(
    code: -25 | -27,
    vaultId: Hex,
    signedTxHex: string,
    cause: Error,
  ) {
    super(
      `Refund broadcast rejected (bitcoind code ${code}): ${cause.message}`,
    );
    this.name = "RefundBroadcastRejectedError";
    this.code = code;
    this.vaultId = vaultId;
    this.signedTxHex = signedTxHex;
    this.cause = cause;
  }
}
