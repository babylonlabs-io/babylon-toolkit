import { chainCarriesCode } from "./causeChain";

// Keep the wallet bundle out of this module. The drift test checks this code.
const WALLET_ACCOUNT_NOT_SUPPORTED_CODE = "WALLET_ACCOUNT_NOT_SUPPORTED";

export function isWalletAccountNotSupported(error: unknown): boolean {
  return chainCarriesCode(error, WALLET_ACCOUNT_NOT_SUPPORTED_CODE);
}
