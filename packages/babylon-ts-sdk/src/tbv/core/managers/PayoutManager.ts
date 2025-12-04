/**
 * Payout Manager
 *
 * High-level manager that orchestrates the payout signing flow by coordinating
 * SDK primitives (buildPayoutPsbt, extractPayoutSignature) with a user-provided
 * Bitcoin wallet.
 *
 * @module managers/PayoutManager
 */

import type { BitcoinWallet } from "../../../shared/wallets/interfaces/BitcoinWallet";
import {
  buildPayoutPsbt,
  extractPayoutSignature,
  type Network,
} from "../primitives";

/**
 * Configuration for the PayoutManager.
 */
export interface PayoutManagerConfig {
  /**
   * Bitcoin network to use for transactions.
   */
  network: Network;

  /**
   * Bitcoin wallet for signing payout transactions.
   */
  btcWallet: BitcoinWallet;
}

/**
 * Parameters for signing a payout transaction.
 */
export interface SignPayoutParams {
  /**
   * Payout transaction hex (unsigned).
   * This is the transaction from the vault provider that needs depositor signature.
   */
  payoutTxHex: string;

  /**
   * Peg-in transaction hex.
   * The original transaction that created the vault output being spent.
   */
  peginTxHex: string;

  /**
   * Claim transaction hex.
   * Required for payout script generation, obtained from vault provider.
   */
  claimTxHex: string;

  /**
   * Vault provider's BTC public key (x-only, 64-char hex).
   */
  vaultProviderBtcPubkey: string;

  /**
   * Liquidator BTC public keys (x-only, 64-char hex).
   */
  liquidatorBtcPubkeys: string[];
}

/**
 * Result of signing a payout transaction.
 */
export interface PayoutSignatureResult {
  /**
   * 64-byte Schnorr signature (128 hex characters).
   */
  signature: string;

  /**
   * Depositor's BTC public key used for signing.
   */
  depositorBtcPubkey: string;
}

/**
 * High-level manager for payout transaction signing.
 */
export class PayoutManager {
  private readonly config: PayoutManagerConfig;

  /**
   * Creates a new PayoutManager instance.
   *
   * @param config - Manager configuration including wallet
   */
  constructor(config: PayoutManagerConfig) {
    this.config = config;
  }

  /**
   * Signs a payout transaction and extracts the Schnorr signature.
   *
   * This method orchestrates the following steps:
   * 1. Get depositor BTC public key from wallet
   * 2. Build unsigned PSBT using primitives
   * 3. Sign PSBT via btcWallet.signPsbt()
   * 4. Extract 64-byte Schnorr signature using primitives
   *
   * The returned signature can be submitted to the vault provider API.
   *
   * @param params - Payout signing parameters
   * @returns Signature result with 64-byte Schnorr signature and depositor pubkey
   * @throws Error if wallet operations fail or signature extraction fails
   */
  async signPayoutTransaction(
    params: SignPayoutParams,
  ): Promise<PayoutSignatureResult> {
    // Step 1: Get depositor BTC public key from wallet
    const depositorBtcPubkeyRaw = await this.config.btcWallet.getPublicKeyHex();
    // Convert 33-byte compressed (66 chars) to 32-byte x-only (64 chars) if needed
    const depositorBtcPubkey = depositorBtcPubkeyRaw.length === 66
      ? depositorBtcPubkeyRaw.slice(2)  // Strip first byte (02 or 03)
      : depositorBtcPubkeyRaw;           // Already x-only

    // Step 2: Build unsigned PSBT using primitives
    const payoutPsbt = await buildPayoutPsbt({
      payoutTxHex: params.payoutTxHex,
      peginTxHex: params.peginTxHex,
      claimTxHex: params.claimTxHex,
      depositorBtcPubkey,
      vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
      liquidatorBtcPubkeys: params.liquidatorBtcPubkeys,
      network: this.config.network,
    });

    // Step 3: Sign PSBT via wallet
    const signedPsbtHex = await this.config.btcWallet.signPsbt(
      payoutPsbt.psbtHex,
    );

    // Step 4: Extract Schnorr signature using primitives
    const signature = extractPayoutSignature(signedPsbtHex, depositorBtcPubkey);

    return {
      signature,
      depositorBtcPubkey,
    };
  }

  /**
   * Gets the configured Bitcoin network.
   *
   * @returns The Bitcoin network (mainnet, testnet, signet, regtest)
   */
  getNetwork(): Network {
    return this.config.network;
  }
}

