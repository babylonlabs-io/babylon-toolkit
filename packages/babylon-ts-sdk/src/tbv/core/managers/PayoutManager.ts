/**
 * Payout Manager
 *
 * High-level manager that orchestrates the payout signing flow by coordinating
 * SDK primitives ({@link buildPayoutOptimisticPsbt}, {@link buildPayoutPsbt},
 * {@link extractPayoutSignature}) with a user-provided Bitcoin wallet.
 *
 * There are two types of payout transactions:
 * - **PayoutOptimistic**: Optimistic path after Claim (no challenge). Input 1 references Claim tx.
 * - **Payout**: Challenge path after Assert (claimer proves validity). Input 1 references Assert tx.
 *
 * @see {@link PeginManager} - For Steps 1, 2, and 4 of peg-in flow
 * @see {@link buildPayoutPsbt} - Lower-level primitive for custom implementations
 * @see {@link extractPayoutSignature} - Extract signatures from signed PSBTs
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
 * - Optimistic path: Use {@link signPayoutOptimisticTransaction} with Claim tx
 * - Challenge path: Use {@link signPayoutTransaction} with Assert tx
 *
 * @remarks
 * After registering your peg-in on Ethereum (Step 2), the vault provider prepares
 * claim/payout transaction pairs. You must sign each payout transaction using this
 * manager and submit the signatures to the vault provider's RPC API.
 *
 * **What happens internally:**
 * 1. Validates your wallet's public key matches the vault's depositor
 * 2. Builds an unsigned PSBT with taproot script path spend info
 * 3. Signs input 0 (the vault UTXO) with your wallet
 * 4. Extracts the 64-byte Schnorr signature
 *
 * **Note:** The payout transaction has 2 inputs. PayoutManager only signs input 0
 * (from the peg-in tx). Input 1 (from the claim/assert tx) is signed by the vault provider.
 *
 * @see {@link PeginManager} - For the complete peg-in flow context
 * @see {@link buildPayoutPsbt} - Lower-level primitive used internally
 * @see {@link extractPayoutSignature} - Signature extraction primitive
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

  /**
   * Checks if the wallet supports batch signing (signPsbts).
   *
   * @returns true if batch signing is supported
   */
  supportsBatchSigning(): boolean {
    return typeof this.config.btcWallet.signPsbts === "function";
  }

  /**
   * Batch signs multiple payout transactions (both PayoutOptimistic and Payout).
   * This allows signing all transactions with a single wallet interaction.
   *
   * @param transactions - Array of transaction pairs to sign
   * @returns Array of signature results matching input order
   * @throws Error if wallet doesn't support batch signing
   * @throws Error if any signing operation fails
   */
  async signPayoutTransactionsBatch(
    transactions: Array<{
      payoutOptimistic: SignPayoutOptimisticParams;
      payout: SignPayoutParams;
    }>,
  ): Promise<
    Array<{
      payoutOptimisticSignature: string;
      payoutSignature: string;
      depositorBtcPubkey: string;
    }>
  > {
    if (!this.supportsBatchSigning()) {
      throw new Error(
        "Wallet does not support batch signing (signPsbts method not available)",
      );
    }

    // Get wallet pubkey once
    const walletPubkeyRaw = await this.config.btcWallet.getPublicKeyHex();

    // Build all PSBTs
    const psbtsToSign: string[] = [];
    const signOptions: Array<{
      autoFinalized: boolean;
      signInputs: Array<{
        index: number;
        publicKey: string;
        disableTweakSigner: boolean;
      }>;
    }> = [];
    const depositorPubkeys: string[] = [];

    for (const tx of transactions) {
      // Validate wallet pubkey matches depositor
      const { depositorPubkey } = validateWalletPubkey(
        walletPubkeyRaw,
        tx.payoutOptimistic.depositorBtcPubkey,
      );
      depositorPubkeys.push(depositorPubkey);

      // Build PayoutOptimistic PSBT
      const payoutOptimisticPsbt = await buildPayoutOptimisticPsbt({
        payoutOptimisticTxHex: tx.payoutOptimistic.payoutOptimisticTxHex,
        peginTxHex: tx.payoutOptimistic.peginTxHex,
        claimTxHex: tx.payoutOptimistic.claimTxHex,
        depositorBtcPubkey: depositorPubkey,
        vaultProviderBtcPubkey: tx.payoutOptimistic.vaultProviderBtcPubkey,
        vaultKeeperBtcPubkeys: tx.payoutOptimistic.vaultKeeperBtcPubkeys,
        universalChallengerBtcPubkeys:
          tx.payoutOptimistic.universalChallengerBtcPubkeys,
        network: this.config.network,
      });
      psbtsToSign.push(payoutOptimisticPsbt.psbtHex);
      signOptions.push({
        autoFinalized: false,
        signInputs: [
          {
            index: 0,
            publicKey: walletPubkeyRaw,
            disableTweakSigner: true,
          },
        ],
      });

      // Build Payout PSBT
      const payoutPsbt = await buildPayoutPsbt({
        payoutTxHex: tx.payout.payoutTxHex,
        peginTxHex: tx.payout.peginTxHex,
        assertTxHex: tx.payout.assertTxHex,
        depositorBtcPubkey: depositorPubkey,
        vaultProviderBtcPubkey: tx.payout.vaultProviderBtcPubkey,
        vaultKeeperBtcPubkeys: tx.payout.vaultKeeperBtcPubkeys,
        universalChallengerBtcPubkeys:
          tx.payout.universalChallengerBtcPubkeys,
        network: this.config.network,
      });
      psbtsToSign.push(payoutPsbt.psbtHex);
      signOptions.push({
        autoFinalized: false,
        signInputs: [
          {
            index: 0,
            publicKey: walletPubkeyRaw,
            disableTweakSigner: true,
          },
        ],
      });
    }

    // Batch sign all PSBTs with single wallet interaction
    const signedPsbts = await this.config.btcWallet.signPsbts!(
      psbtsToSign,
      signOptions,
    );

    // Validate that wallet returned the expected number of signed PSBTs
    const expectedCount = transactions.length * 2;
    if (signedPsbts.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} signed PSBTs (${transactions.length} transactions × 2) but received ${signedPsbts.length}`,
      );
    }

    // Extract signatures from signed PSBTs
    const results: Array<{
      payoutOptimisticSignature: string;
      payoutSignature: string;
      depositorBtcPubkey: string;
    }> = [];

    // Map each transaction pair to its 2 PSBTs in the flattened signedPsbts array:
    // - Each transaction generates 2 PSBTs (PayoutOptimistic first, then Payout)
    // - i * 2 = PayoutOptimistic PSBT index (even indices: 0, 2, 4...)
    // - i * 2 + 1 = Payout PSBT index (odd indices: 1, 3, 5...)
    for (let i = 0; i < transactions.length; i++) {
      const payoutOptimisticIndex = i * 2;
      const payoutIndex = i * 2 + 1;
      const depositorPubkey = depositorPubkeys[i];

      const payoutOptimisticSignature = extractPayoutSignature(
        signedPsbts[payoutOptimisticIndex],
        depositorPubkey,
      );
      const payoutSignature = extractPayoutSignature(
        signedPsbts[payoutIndex],
        depositorPubkey,
      );

      results.push({
        payoutOptimisticSignature,
        payoutSignature,
        depositorBtcPubkey: depositorPubkey,
      });
    }

    return results;
  }
}
