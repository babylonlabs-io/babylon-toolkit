import type { Address, Hex } from "viem";

/**
 * Typed refusal from the DepositTerms rebuild when the connected Ethereum
 * wallet is not the vault's depositor. The most user-fixable thing the rebuild
 * can throw, so both mappers branch on the class (not the message) and render
 * "connect the depositor wallet" instead of the generic fallback.
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

/** True when `err` is the rebuild's typed depositor-wallet refusal. */
export function isDepositorWalletMismatchError(
  err: unknown,
): err is DepositorWalletMismatchError {
  return err instanceof DepositorWalletMismatchError;
}
