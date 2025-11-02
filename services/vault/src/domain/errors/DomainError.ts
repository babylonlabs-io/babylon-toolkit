/**
 * Base class for all domain errors.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a deposit is invalid.
 */
export class InvalidDepositError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown when a vault is not found.
 */
export class VaultNotFoundError extends DomainError {
  constructor(vaultId: string) {
    super(`Vault not found: ${vaultId}`);
  }
}

/**
 * Thrown when a vault is not active.
 */
export class VaultNotActiveError extends DomainError {
  constructor(vaultId?: string) {
    super(vaultId ? `Vault is not active: ${vaultId}` : "Vault is not active");
  }
}

/**
 * Thrown when a deposit is not found.
 */
export class DepositNotFoundError extends DomainError {
  constructor(depositId: string) {
    super(`Deposit not found: ${depositId}`);
  }
}

/**
 * Thrown when trying to perform an invalid operation on a deposit.
 */
export class InvalidDepositOperationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown when there are insufficient funds.
 */
export class InsufficientFundsError extends DomainError {
  constructor(required: bigint, available: bigint) {
    super(`Insufficient funds: required ${required}, available ${available}`);
  }
}

/**
 * Thrown when UTXOs are invalid or insufficient.
 */
export class InvalidUTXOsError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
