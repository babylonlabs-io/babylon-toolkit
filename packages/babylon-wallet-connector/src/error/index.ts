import { ERROR_CODES } from "./codes";

interface ErrorParams {
  code: string;
  message: string;
  wallet?: string;
  version?: string;
  chainId?: string;
}

export class WalletError extends Error {
  readonly code: string;
  readonly wallet?: string;
  readonly version?: string;
  readonly chainId?: string;

  constructor({ code, message, wallet, version, chainId }: ErrorParams, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.wallet = wallet;
    this.version = version;
    this.chainId = chainId;
  }
}

/**
 * Returns true when the underlying error message indicates the user rejected
 * a wallet prompt (sign, connect, approve). Wallet providers expose this in
 * varying phrasings — match the exact ones used by supported wallets, not
 * the bare word "rejected" (some validation errors include it too).
 */
export function isUserRejectionMessage(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("user cancelled") ||
    lower.includes("user canceled")
  );
}

/**
 * Returns true when a provider refused a chain-scoped disconnect because that
 * chain shares its wallet session with another chain. The refusal is a
 * designed answer, not a fault: nothing was disconnected.
 */
export function isSharedSessionRefusal(error: unknown): error is WalletError {
  return error instanceof WalletError && error.code === ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED;
}

export * from "./codes";
