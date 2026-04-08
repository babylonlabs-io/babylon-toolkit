/**
 * Vault activation service — calls activateVaultWithSecret on the contract
 *
 * After the depositor broadcasts the Pre-PegIn tx and the vault reaches
 * Verified status, the depositor reveals the HTLC secret on Ethereum to
 * move the vault from Verified -> Active. The VP then uses the revealed
 * secret to claim the HTLC on Bitcoin.
 */

import { getETHChain } from "@babylonlabs-io/config";
import type { Abi, Hex, WalletClient } from "viem";

import BTCVaultRegistryABI from "@/clients/eth-contract/btc-vault-registry/abis/BTCVaultRegistry.abi.json";
import {
  executeWrite,
  type TransactionResult,
} from "@/clients/eth-contract/transactionFactory";
import { CONTRACTS } from "@/config/contracts";

export interface ActivateVaultParams {
  /** Vault ID (bytes32, 0x-prefixed) */
  vaultId: Hex;
  /** HTLC secret preimage (bytes32, 0x-prefixed) */
  secret: Hex;
  /** Ethereum wallet client for signing the transaction */
  walletClient: WalletClient;
}

/**
 * Call activateVaultWithSecret on the BTCVaultRegistry contract.
 *
 * Reveals the HTLC secret on Ethereum, moving the vault Verified -> Active.
 * The contract verifies SHA256(secret) == vault.hashlock and checks the
 * activation deadline has not passed.
 */
export async function activateVaultWithSecret(
  params: ActivateVaultParams,
): Promise<TransactionResult> {
  const { vaultId, secret, walletClient } = params;

  return executeWrite({
    walletClient,
    chain: getETHChain(),
    address: CONTRACTS.BTC_VAULT_REGISTRY,
    abi: BTCVaultRegistryABI as Abi,
    functionName: "activateVaultWithSecret",
    args: [vaultId, secret, "0x"],
    errorContext: "vault activation",
  });
}
