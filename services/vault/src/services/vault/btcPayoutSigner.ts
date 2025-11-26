/**
 * BTC Payout Transaction Signer
 *
 * Low-level Bitcoin signing utility for payout transactions using Taproot script path spend.
 * Uses SDK primitives to build PSBTs and extract Schnorr signatures.
 */

import {
  buildPayoutPsbt,
  extractPayoutSignature,
  type Network,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

export interface SignPayoutTransactionParams {
  payoutTxHex: string;
  peginTxHex: string;
  claimTxHex: string;
  depositorBtcPubkey: string;
  vaultProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  network: Network;
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  };
}

/**
 * Sign a payout transaction using Taproot script path spend
 *
 * This function uses SDK Level 1 primitives:
 * 1. buildPayoutPsbt() - Builds unsigned PSBT with Taproot script path spend info
 * 2. extractPayoutSignature() - Extracts 64-byte Schnorr signature from signed PSBT
 *
 * @param params - Payout transaction parameters
 * @returns 64-byte Schnorr signature (128 hex characters, no sighash flag)
 *
 */
export async function signPayoutTransaction(
  params: SignPayoutTransactionParams,
): Promise<string> {
  const {
    payoutTxHex,
    peginTxHex,
    claimTxHex,
    depositorBtcPubkey,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
    network,
    btcWalletProvider,
  } = params;

  try {
    // Build PSBT using SDK Level 1 primitive
    // Note: SDK normalizes hex inputs internally (strips 0x prefix if present)
    const payoutPsbt = await buildPayoutPsbt({
      payoutTxHex,
      peginTxHex,
      claimTxHex,
      depositorBtcPubkey,
      vaultProviderBtcPubkey,
      liquidatorBtcPubkeys,
      network,
    });

    // Sign PSBT with user's BTC wallet
    const signedPsbtHex = await btcWalletProvider.signPsbt(payoutPsbt.psbtHex);

    // Extract signature using SDK Level 1 primitive
    const signature = extractPayoutSignature(signedPsbtHex, depositorBtcPubkey);

    return signature;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to sign payout transaction: ${error.message}`);
    }
    throw new Error("Failed to sign payout transaction: Unknown error");
  }
}
