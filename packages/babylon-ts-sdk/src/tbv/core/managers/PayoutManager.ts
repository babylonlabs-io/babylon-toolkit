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
  validateWalletPubkey,
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

  /**
   * Depositor's BTC public key (x-only, 64-char hex).
   * This should be the public key that was used when creating the vault,
   * as stored on-chain. If not provided, will be fetched from the wallet.
   */
  depositorBtcPubkey?: string;
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
   * 1. Get wallet's public key and convert to x-only format
   * 2. Validate wallet pubkey matches on-chain depositor pubkey (if provided)
   * 3. Build unsigned PSBT using primitives
   * 4. Sign PSBT via btcWallet.signPsbt()
   * 5. Extract 64-byte Schnorr signature using primitives
   *
   * The returned signature can be submitted to the vault provider API.
   *
   * @param params - Payout signing parameters
   * @returns Signature result with 64-byte Schnorr signature and depositor pubkey
   * @throws Error if wallet pubkey doesn't match depositor pubkey
   * @throws Error if wallet operations fail or signature extraction fails
   */
  async signPayoutTransaction(
    params: SignPayoutParams,
  ): Promise<PayoutSignatureResult> {
    // Validate wallet pubkey matches depositor and get both formats
    const walletPubkeyRaw = await this.config.btcWallet.getPublicKeyHex();
    const { depositorPubkey } = validateWalletPubkey(
      walletPubkeyRaw,
      params.depositorBtcPubkey,
    );

    // Build unsigned PSBT
    const payoutPsbt = await buildPayoutPsbt({
      payoutTxHex: params.payoutTxHex,
      peginTxHex: params.peginTxHex,
      claimTxHex: params.claimTxHex,
      depositorBtcPubkey: depositorPubkey,
      vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
      liquidatorBtcPubkeys: params.liquidatorBtcPubkeys,
      network: this.config.network,
    });

    // Sign PSBT via wallet
    // - signInputs restricts signing to input 0 only (input 1 is signed by claimer/challengers)
    // - walletPubkeyRaw uses compressed format (66 chars) as expected by wallets like UniSat
    // - disableTweakSigner is required for Taproot script path spend (uses untweaked key)
    const signedPsbtHex = await this.config.btcWallet.signPsbt(
      payoutPsbt.psbtHex,
      {
        autoFinalized: false,
        signInputs: [
          {
            index: 0,
            publicKey: walletPubkeyRaw,
            disableTweakSigner: true,
          },
        ],
      },
    );

    // Extract Schnorr signature
    const signature = extractPayoutSignature(signedPsbtHex, depositorPubkey);

    return {
      signature,
      depositorBtcPubkey: depositorPubkey,
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

