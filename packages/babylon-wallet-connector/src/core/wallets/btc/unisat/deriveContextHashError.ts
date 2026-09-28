import { ERROR_CODES, WalletError } from "@/error";

// UniSat rejects accounts that cannot sign with this exact message.
// https://github.com/unisat-wallet/wallet/blob/extension/v1.7.19/packages/wallet-background/src/controllers/wallet.ts#L1134-L1145
const UNSUPPORTED_ACCOUNT_MESSAGE =
  "Current keyring does not support deriveContextHash";

// Keep this helper separate from provider.ts so unit tests do not import SVGs.
export function mapUnisatDeriveContextHashError(
  error: unknown,
  wallet: string,
): unknown {
  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    error.message === UNSUPPORTED_ACCOUNT_MESSAGE
  ) {
    return new WalletError({
      code: ERROR_CODES.WALLET_ACCOUNT_NOT_SUPPORTED,
      message:
        "The selected account cannot create the deposit secret. Switch to an account created from a recovery phrase or a private key, then try again.",
      wallet,
    });
  }
  return error;
}
