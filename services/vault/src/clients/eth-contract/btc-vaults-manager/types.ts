// BTC Vaults Manager - Type definitions

import type { Address, Hex } from "viem";

/**
 * Vault data structure
 *
 * Represents a BTC vault (deposit) on-chain. A vault locks BTC and enables
 * minting of vBTC that can be used as collateral in applications like Morpho.
 *
 * VaultStatus enum values (from BTCVaultsManager contract):
 * 0 = Pending - Request submitted, waiting for ACKs
 * 1 = Verified - All ACKs collected, ready for inclusion proof
 * 2 = Active - Inclusion proof verified, vBTC can be minted, vault is active
 * 3 = Redeemed - Vault has been redeemed (terminal state)
 */
export interface Vault {
  depositor: Address;
  depositorBtcPubkey: Hex;
  unsignedBtcTx: Hex;
  amount: bigint;
  vaultProvider: Address;
  status: number; // VaultStatus: 0=Pending, 1=Verified, 2=Active, 3=Redeemed
  applicationController: Address; // Application the vault is registered for (immutable, set at creation)
}
