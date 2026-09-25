/**
 * Wallet identity validation for delegated claim signing.
 *
 * @module services/delegated-claim/walletIdentity
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";

import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";
import { isAddressFromPublicKey } from "../../primitives/utils/bitcoin";
import {
  COMPRESSED_PUBKEY_HEX_LEN,
  X_ONLY_PUBKEY_HEX_LEN,
} from "../../utils/validation";

/** Hex length of the SEC1 prefix byte a compressed key carries before its x coordinate. */
const COMPRESSED_PREFIX_HEX_LEN =
  COMPRESSED_PUBKEY_HEX_LEN - X_ONLY_PUBKEY_HEX_LEN;

/**
 * The 32-byte x-only form of a compressed or x-only public key, lowercase.
 *
 * @experimental
 */
export function xOnlyHex(publicKeyHex: string): string {
  const hex = publicKeyHex.replace(/^0x/, "").toLowerCase();
  if (hex.length === COMPRESSED_PUBKEY_HEX_LEN)
    return hex.slice(COMPRESSED_PREFIX_HEX_LEN);
  if (hex.length === X_ONLY_PUBKEY_HEX_LEN) return hex;
  throw new Error(
    `Public key must be 33-byte compressed or 32-byte x-only hex, got ${hex.length / 2} bytes.`,
  );
}

/**
 * Returns the wallet's signing address, once both it and the wallet's public
 * key are proved to be the vault's depositor.
 *
 * Both halves matter. The public key is what the graph's scripts commit to;
 * the address is what the sign options name the signer by, and a wallet whose
 * reported address and public key belong to different accounts would
 * otherwise sign the whole batch for the wrong account.
 *
 * @throws When the wallet is on a different account than the vault's
 *         depositor, or reports an address that key does not control.
 * @experimental
 */
export async function assertWalletMatchesDepositor(
  btcWallet: BitcoinWallet,
  depositorPublicKey: string,
  btcNetwork: Network,
): Promise<string> {
  const walletPublicKey = await btcWallet.getPublicKeyHex();
  if (xOnlyHex(walletPublicKey) !== xOnlyHex(depositorPublicKey)) {
    throw new Error(
      "Connected wallet does not hold the vault's depositor key. " +
        "Select the account that made the deposit, then try again.",
    );
  }

  const signerAddress = await btcWallet.getAddress();
  // The wallet's own key, just proved x-equal to the depositor's: a
  // native-segwit address needs its parity byte, which the on-chain x-only
  // key does not carry (the deposit-time check passes the wallet key too).
  if (!isAddressFromPublicKey(signerAddress, walletPublicKey, btcNetwork)) {
    throw new Error(
      `Connected wallet reports address "${signerAddress}", which is not ` +
        "derived from the vault's depositor key. Select the account that " +
        "made the deposit, then try again.",
    );
  }
  return signerAddress;
}
