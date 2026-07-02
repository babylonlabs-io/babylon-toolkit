/**
 * Shared Ethereum address derivation.
 *
 * Derives the standard BIP44 Ethereum address (m/44'/60'/0'/0/0, EIP-55 checksummed) for ANY
 * mnemonic via viem — nothing hardcoded. The ETH address is chain-independent (same on mainnet /
 * Sepolia / etc.), so no network switch is needed to verify it.
 */
import { mnemonicToAccount } from "viem/accounts";

export function deriveEthAddress(mnemonic: string): string {
  return mnemonicToAccount(mnemonic.trim()).address;
}
