/**
 * Error types for Vault service
 */
export enum ErrorType {
  // Server-related errors
  SERVER = "SERVER",

  // Vault operations
  VAULT_DEPOSIT = "VAULT_DEPOSIT",
  VAULT_REDEEM = "VAULT_REDEEM",
  VAULT_BORROW = "VAULT_BORROW",
  VAULT_REPAY = "VAULT_REPAY",

  // Wallet errors
  WALLET = "WALLET",

  // Fallback
  UNKNOWN = "UNKNOWN",
}

/**
 * Error object structure
 */
export interface AppError {
  message: string;
  type?: ErrorType;
  displayMessage?: string;
  trace?: string;
  metadata?: Record<string, any>;
}

/**
 * Error handler parameters
 */
export interface ErrorHandlerParam {
  error: Error | null;
  metadata?: Record<string, unknown>;
  displayOptions?: {
    retryAction?: () => void;
    noCancel?: boolean;
    showModal?: boolean;
  };
}
