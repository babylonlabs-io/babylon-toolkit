/**
 * BTC Payout Transaction Signer
 *
 * High-level payout signing service using PayoutManager from the SDK.
 * Orchestrates the complete payout signing flow: build → sign → extract signature.
 *
 * There are two types of payout transactions:
 * - **PayoutOptimistic**: Optimistic path after Claim (no challenge). Input 1 references Claim tx.
 * - **Payout**: Challenge path after Assert (claimer proves validity). Input 1 references Assert tx.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { PayoutManager, type Network } from "@babylonlabs-io/ts-sdk/tbv/core";

/** Base parameters shared by both payout transaction types */
interface SignPayoutBaseParams {
  peginTxHex: string;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  network: Network;
  /** Depositor's BTC public key from vault data (x-only, 64-char hex) */
  depositorBtcPubkey: string;
}

/** Parameters for signing a PayoutOptimistic transaction */
export interface SignPayoutOptimisticTransactionParams
  extends SignPayoutBaseParams {
  payoutOptimisticTxHex: string;
  claimTxHex: string;
}

/** Parameters for signing a Payout transaction (challenge path) */
export interface SignPayoutTransactionParams extends SignPayoutBaseParams {
  payoutTxHex: string;
  assertTxHex: string;
}

/**
 * Sign a PayoutOptimistic transaction using PayoutManager.
 *
 * PayoutOptimistic is used in the **optimistic path** when no challenge occurs:
 * 1. Vault provider submits Claim transaction
 * 2. Challenge period passes without challenge
 * 3. PayoutOptimistic can be executed (references Claim tx)
 *
 * @param btcWallet - Bitcoin wallet adapter implementing BitcoinWallet interface
 * @param params - PayoutOptimistic transaction parameters
 * @returns 64-byte Schnorr signature (128 hex characters)
 */
export async function signPayoutOptimisticTransaction(
  btcWallet: BitcoinWallet,
  params: SignPayoutOptimisticTransactionParams,
): Promise<string> {
  try {
    const payoutManager = new PayoutManager({
      network: params.network,
      btcWallet,
    });

    const result = await payoutManager.signPayoutOptimisticTransaction({
      payoutOptimisticTxHex: params.payoutOptimisticTxHex,
      peginTxHex: params.peginTxHex,
      claimTxHex: params.claimTxHex,
      vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
      depositorBtcPubkey: params.depositorBtcPubkey,
    });

    return result.signature;
  } catch (error) {
    console.error(
      "[btcPayoutSigner] Error signing PayoutOptimistic transaction:",
      error,
    );
    if (error instanceof Error) {
      throw new Error(
        `Failed to sign PayoutOptimistic transaction: ${error.message}`,
      );
    }
    throw new Error(
      "Failed to sign PayoutOptimistic transaction: Unknown error",
    );
  }
}

/**
 * Sign a Payout transaction (challenge path) using PayoutManager.
 *
 * Payout is used in the **challenge path** when the claimer proves validity:
 * 1. Vault provider submits Claim transaction
 * 2. Challenge is raised during challenge period
 * 3. Claimer submits Assert transaction to prove validity
 * 4. Payout can be executed (references Assert tx)
 *
 * @param btcWallet - Bitcoin wallet adapter implementing BitcoinWallet interface
 * @param params - Payout transaction parameters
 * @returns 64-byte Schnorr signature (128 hex characters)
 */
export async function signPayoutTransaction(
  btcWallet: BitcoinWallet,
  params: SignPayoutTransactionParams,
): Promise<string> {
  try {
    const payoutManager = new PayoutManager({
      network: params.network,
      btcWallet,
    });

    const result = await payoutManager.signPayoutTransaction({
      payoutTxHex: params.payoutTxHex,
      peginTxHex: params.peginTxHex,
      assertTxHex: params.assertTxHex,
      vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
      depositorBtcPubkey: params.depositorBtcPubkey,
    });

    return result.signature;
  } catch (error) {
    console.error("[btcPayoutSigner] Error signing Payout transaction:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to sign Payout transaction: ${error.message}`);
    }
    throw new Error("Failed to sign Payout transaction: Unknown error");
  }
}
