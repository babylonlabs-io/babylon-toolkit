import { chainCarriesCode } from "./causeChain";

// Keep the wallet bundle out of this module. The drift test checks this code.
const WALLET_ACCOUNT_CHANGED_CODE = "WALLET_ACCOUNT_CHANGED";

export function isWalletAccountChanged(error: unknown): boolean {
  return chainCarriesCode(error, WALLET_ACCOUNT_CHANGED_CODE);
}
