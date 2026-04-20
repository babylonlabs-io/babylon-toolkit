/**
 * Vault activation service — calls activateVaultWithSecret on the contract.
 *
 * After the depositor broadcasts the Pre-PegIn tx and the vault reaches
 * Verified status, the depositor reveals the HTLC secret on Ethereum to
 * move the vault from Verified -> Active. The VP then uses the revealed
 * secret to claim the HTLC on Bitcoin.
 *
 * Protocol logic lives in the SDK (`activateVault`); this adapter wires
 * the vault's contract-write transport (`executeWrite`) into the SDK's
 * injected-writer interface so viem error decoding, simulation, and
 * receipt handling stay in the app tier.
 */

import { getETHChain } from "@babylonlabs-io/config";
import {
  activateVault,
  type EthContractWriter,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Hex, WalletClient } from "viem";

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

export async function activateVaultWithSecret(
  params: ActivateVaultParams,
): Promise<TransactionResult> {
  const { vaultId, secret, walletClient } = params;

  const writer: EthContractWriter<TransactionResult> = (call) =>
    executeWrite({
      walletClient,
      chain: getETHChain(),
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      errorContext: "vault activation",
    });

  return activateVault<TransactionResult>({
    btcVaultRegistryAddress: CONTRACTS.BTC_VAULT_REGISTRY,
    vaultId,
    secret,
    // Vault's activation flow has no metadata payload today; pass the
    // contract's "empty bytes" sentinel explicitly rather than relying on
    // an SDK-side default, per the no-fallback rule on tx-creation paths.
    activationMetadata: "0x",
    writeContract: writer,
  });
}
