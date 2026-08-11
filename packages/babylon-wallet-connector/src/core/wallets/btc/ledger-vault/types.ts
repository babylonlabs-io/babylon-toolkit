/**
 * Adapter-local mirror of the SDK's deposit-terms seam.
 *
 * Declared structurally rather than imported: there is deliberately no
 * dependency edge from wallet-connector to the ts-sdk. The cross-package
 * contract is the SHAPE, documented on the SDK's `DepositTermsApprover`.
 *
 * @module wallets/btc/ledger-vault/types
 */

/** One vault group within an intent. Field names follow btc-vault vocabulary. */
export interface DepositTermsVaultGroup {
  readonly htlcVout: number;
  readonly vaultProviderBtcPubkey: string;
  readonly peginAmount: bigint;
  /** Maximum commission the depositor accepts, in sats. */
  readonly commissionFee: bigint;
  readonly depositorClaimValue: bigint;
  readonly peginMaxFee: bigint;
}

/** What the depositor approves on-device before any signing. */
export interface DepositTerms {
  readonly vaultCoreVersion: number;
  readonly protocolFeeRate: bigint;
  readonly timelockPegin: number;
  readonly timelockAssert: number;
  readonly timelockRefund: number;
  readonly prepeginTxid: string;
  readonly prepeginMaxFee: bigint;
  readonly vaultKeeperBtcPubkeys: readonly string[];
  readonly universalChallengerBtcPubkeys: readonly string[];
  readonly vaults: readonly DepositTermsVaultGroup[];
}

/** The `name` the SDK matches on — part of the cross-package contract. */
export const DEPOSIT_TERMS_REJECTED_ERROR_NAME = "DepositTermsRejectedError";

/** The only rejection reason this adapter produces. */
export type DepositTermsRejectionReason = "device-envelope";

/**
 * Thrown when terms fall outside the device's accepted envelope.
 *
 * The SDK's `isDepositTermsRejectedError` matches on `name` AND `reason`, so
 * both must be set or friendly error mapping is silently lost.
 */
export class DepositTermsRejectedError extends Error {
  readonly reason: DepositTermsRejectionReason;

  constructor(message: string, reason: DepositTermsRejectionReason = "device-envelope") {
    super(message);
    this.name = DEPOSIT_TERMS_REJECTED_ERROR_NAME;
    this.reason = reason;
  }
}
