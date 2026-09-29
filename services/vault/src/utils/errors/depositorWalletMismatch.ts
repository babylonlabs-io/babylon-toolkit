import type { Address, Hex } from "viem";

/**
 * Typed refusal when the connected Ethereum wallet is not the vault's
 * depositor. The DepositTerms rebuild and the resume wallet check throw it.
 * The user can fix it, so both mappers branch on the class (not the message)
 * and render "connect the depositor wallet" instead of the generic fallback.
 */
export class DepositorWalletMismatchError extends Error {
  readonly vaultId: Hex;
  readonly expectedDepositor: Address;
  readonly connectedDepositor: Address;

  constructor(fields: {
    vaultId: Hex;
    expectedDepositor: Address;
    connectedDepositor: Address;
  }) {
    super(
      `Vault ${fields.vaultId} is owned by ${fields.expectedDepositor}, but the ` +
        `connected wallet is ${fields.connectedDepositor}. Connect with the ` +
        `depositor wallet to resume.`,
    );
    this.name = "DepositorWalletMismatchError";
    this.vaultId = fields.vaultId;
    this.expectedDepositor = fields.expectedDepositor;
    this.connectedDepositor = fields.connectedDepositor;
  }
}

/** True when `err` is the typed depositor-wallet refusal. */
export function isDepositorWalletMismatchError(
  err: unknown,
): err is DepositorWalletMismatchError {
  return err instanceof DepositorWalletMismatchError;
}

/**
 * Typed refusal when the connected Bitcoin wallet's key is not the depositor
 * key the vault registered on-chain. The resume wallet check, the payout
 * signing context, the payout signing adapter and the DepositTerms rebuild
 * throw it. Both mappers branch on the class and ask the user to connect the
 * depositor's Bitcoin wallet.
 */
export class DepositorBtcKeyMismatchError extends Error {
  readonly vaultId: Hex;
  /** On-chain depositor key, lowercase x-only hex without `0x`. */
  readonly expectedDepositorBtcPubkey: string;
  /** Connected wallet key, lowercase x-only hex without `0x`. */
  readonly connectedBtcPubkey: string;

  constructor(fields: {
    vaultId: Hex;
    expectedDepositorBtcPubkey: string;
    connectedBtcPubkey: string;
  }) {
    super(
      `Vault ${fields.vaultId} was registered with Bitcoin key ` +
        `${fields.expectedDepositorBtcPubkey}, but the connected Bitcoin ` +
        `wallet holds ${fields.connectedBtcPubkey}. Connect with the ` +
        `depositor's Bitcoin wallet to continue.`,
    );
    this.name = "DepositorBtcKeyMismatchError";
    this.vaultId = fields.vaultId;
    this.expectedDepositorBtcPubkey = fields.expectedDepositorBtcPubkey;
    this.connectedBtcPubkey = fields.connectedBtcPubkey;
  }
}

/** True when `err` is the typed depositor Bitcoin-key refusal. */
export function isDepositorBtcKeyMismatchError(
  err: unknown,
): err is DepositorBtcKeyMismatchError {
  return err instanceof DepositorBtcKeyMismatchError;
}
