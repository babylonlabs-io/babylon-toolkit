/**
 * Payout Manager
 *
 * High-level manager that orchestrates the payout signing flow by coordinating
 * SDK primitives (buildPayoutOptimisticPsbt, buildPayoutPsbt, extractPayoutSignature)
 * with a user-provided Bitcoin wallet.
 *
 * There are two types of payout transactions:
 * - **PayoutOptimistic**: Optimistic path after Claim (no challenge). Input 1 references Claim tx.
 * - **Payout**: Challenge path after Assert (claimer proves validity). Input 1 references Assert tx.
 *
 * @module managers/PayoutManager
 */

import type { BitcoinWallet } from "../../../shared/wallets/interfaces/BitcoinWallet";
import {
  buildPayoutOptimisticPsbt,
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
 * Base parameters shared by both payout transaction types.
 */
interface SignPayoutBaseParams {
  /**
   * Peg-in transaction hex.
   * The original transaction that created the vault output being spent.
   */
  peginTxHex: string;

  /**
   * Vault provider's BTC public key (x-only, 64-char hex).
   */
  vaultProviderBtcPubkey: string;

  /**
   * Vault keeper BTC public keys (x-only, 64-char hex).
   */
  vaultKeeperBtcPubkeys: string[];

  /**
   * Universal challenger BTC public keys (x-only, 64-char hex).
   */
  universalChallengerBtcPubkeys: string[];

  /**
   * Depositor's BTC public key (x-only, 64-char hex).
   * This should be the public key that was used when creating the vault,
   * as stored on-chain. If not provided, will be fetched from the wallet.
   */
  depositorBtcPubkey?: string;
}

/**
 * Parameters for signing a PayoutOptimistic transaction.
 *
 * PayoutOptimistic is used in the optimistic path when no challenge occurs.
 * Input 1 references the Claim transaction.
 */
export interface SignPayoutOptimisticParams extends SignPayoutBaseParams {
  /**
   * PayoutOptimistic transaction hex (unsigned).
   * This is the transaction from the vault provider that needs depositor signature.
   */
  payoutOptimisticTxHex: string;

  /**
   * Claim transaction hex.
   * PayoutOptimistic input 1 references Claim output 0.
   */
  claimTxHex: string;
}

/**
 * Parameters for signing a Payout transaction (challenge path).
 *
 * Payout is used in the challenge path after Assert, when the claimer proves validity.
 * Input 1 references the Assert transaction.
 */
export interface SignPayoutParams extends SignPayoutBaseParams {
  /**
   * Payout transaction hex (unsigned).
   * This is the transaction from the vault provider that needs depositor signature.
   */
  payoutTxHex: string;

  /**
   * Assert transaction hex.
   * Payout input 1 references Assert output 0.
   */
  assertTxHex: string;
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
 *
 * Supports both payout paths:
 * - Optimistic path: Use `signPayoutOptimisticTransaction()` with Claim tx
 * - Challenge path: Use `signPayoutTransaction()` with Assert tx
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
   * Signs a PayoutOptimistic transaction and extracts the Schnorr signature.
   *
   * PayoutOptimistic is used in the **optimistic path** when no challenge occurs:
   * 1. Vault provider submits Claim transaction
   * 2. Challenge period passes without challenge
   * 3. PayoutOptimistic can be executed (references Claim tx)
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
   * @param params - PayoutOptimistic signing parameters
   * @returns Signature result with 64-byte Schnorr signature and depositor pubkey
   * @throws Error if wallet pubkey doesn't match depositor pubkey
   * @throws Error if wallet operations fail or signature extraction fails
   */
  async signPayoutOptimisticTransaction(
    params: SignPayoutOptimisticParams,
  ): Promise<PayoutSignatureResult> {
    // Validate wallet pubkey matches depositor and get both formats
    const walletPubkeyRaw = await this.config.btcWallet.getPublicKeyHex();
    const { depositorPubkey } = validateWalletPubkey(
      walletPubkeyRaw,
      params.depositorBtcPubkey,
    );

    // Build unsigned PSBT for PayoutOptimistic (uses Claim tx)
    const payoutPsbt = await buildPayoutOptimisticPsbt({
      payoutOptimisticTxHex: params.payoutOptimisticTxHex,
      peginTxHex: params.peginTxHex,
      claimTxHex: params.claimTxHex,
      depositorBtcPubkey: depositorPubkey,
      vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
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
   * Signs a Payout transaction (challenge path) and extracts the Schnorr signature.
   *
   * Payout is used in the **challenge path** when the claimer proves validity:
   * 1. Vault provider submits Claim transaction
   * 2. Challenge is raised during challenge period
   * 3. Claimer submits Assert transaction to prove validity
   * 4. Payout can be executed (references Assert tx)
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

    // Build unsigned PSBT for Payout (uses Assert tx)
    const payoutPsbt = await buildPayoutPsbt({
      payoutTxHex: params.payoutTxHex,
      peginTxHex: params.peginTxHex,
      assertTxHex: params.assertTxHex,
      depositorBtcPubkey: depositorPubkey,
      vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
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
