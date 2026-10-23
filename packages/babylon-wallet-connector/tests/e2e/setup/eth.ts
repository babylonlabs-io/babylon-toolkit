/**
 * Shared Ethereum address derivation.
 *
 * Derives the standard BIP44 Ethereum address (m/44'/60'/0'/0/i, EIP-55 checksummed) for ANY
 * mnemonic via viem — nothing hardcoded. The ETH address is chain-independent (same on mainnet /
 * Sepolia / etc.), so no network switch is needed to verify it.
 *
 * `accountNumber` is MetaMask's "Account N": MetaMask numbers the accounts of one Secret Recovery
 * Phrase from 1 along the address index, so Account N is i = N - 1. It is NOT viem's `accountIndex`,
 * which is the hardened account level of the path.
 */
import { mnemonicToAccount } from "viem/accounts";

export function deriveEthAddress(mnemonic: string, accountNumber = 1): string {
  if (!Number.isInteger(accountNumber) || accountNumber < 1)
    throw new Error(`Ethereum account number must be a positive integer (got ${accountNumber}).`);
  return mnemonicToAccount(mnemonic.trim(), { addressIndex: accountNumber - 1 }).address;
}
