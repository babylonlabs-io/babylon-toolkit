/**
 * BTC Payout Transaction Signer
 *
 * High-level payout signing service using PayoutManager from the SDK.
 * Orchestrates the complete payout signing flow: build → sign → extract signature.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { PayoutManager, type Network } from "@babylonlabs-io/ts-sdk/tbv/core";

export interface SignPayoutTransactionParams {
  payoutTxHex: string;
  peginTxHex: string;
  claimTxHex: string;
  vaultProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  network: Network;
}

/**
 * Sign a payout transaction using PayoutManager.
 *
 * The manager handles:
 * 1. Getting depositor BTC pubkey from wallet
 * 2. Building PSBT with Taproot script path spend
 * 3. Signing via wallet.signPsbt()
 * 4. Extracting 64-byte Schnorr signature
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
    // Create manager with wallet
    const payoutManager = new PayoutManager({
      network: params.network,
      btcWallet,
    });

    // Manager orchestrates the complete flow
    const result = await payoutManager.signPayoutTransaction({
      payoutTxHex: params.payoutTxHex,
      peginTxHex: params.peginTxHex,
      claimTxHex: params.claimTxHex,
      vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
      liquidatorBtcPubkeys: params.liquidatorBtcPubkeys,
    });

    return result.signature;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to sign payout transaction: ${error.message}`);
    }
    throw new Error("Failed to sign payout transaction: Unknown error");
  }
}
