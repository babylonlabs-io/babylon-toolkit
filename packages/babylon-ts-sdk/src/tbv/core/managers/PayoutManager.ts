/**
 * Payout Manager
 *
 * High-level manager that orchestrates the payout signing flow by coordinating
 * SDK primitives ({@link buildPayoutPsbt}, {@link extractPayoutSignature})
 * with a user-provided Bitcoin wallet.
 *
 * The Payout transaction references the Assert transaction (input 1).
 *
 * @see {@link PeginManager} - For Steps 1–4 of the peg-in flow
 * @see {@link buildPayoutPsbt} - Lower-level primitive for custom implementations
 * @see {@link extractPayoutSignature} - Extract signatures from signed PSBTs
 *
 * @module managers/PayoutManager
 */

import { Buffer } from "buffer";

import { Transaction } from "bitcoinjs-lib";

import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "../../../shared/wallets";
import { createTaprootScriptPathSignOptions } from "../utils/signing";
import {
  buildPayoutPsbt,
  extractPayoutSignature,
  isValidHex,
  stripHexPrefix,
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
   * CSV timelock in blocks for the PegIn output.
   */
  timelockPegin: number;

  /**
   * Depositor's BTC public key (x-only, 64-char hex).
   * This should be the public key that was used when creating the vault,
   * as stored on-chain. If not provided, will be fetched from the wallet.
   */
  depositorBtcPubkey?: string;

  /**
   * The on-chain registered depositor payout scriptPubKey (hex, with or without 0x prefix).
   * Used to validate that the VP-provided payout transaction actually pays to the
   * correct depositor payout address before signing.
   */
  registeredPayoutScriptPubKey: string;
}

/**
 * Parameters for signing a Payout transaction.
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
 * @remarks
 * After registering your peg-in on Ethereum (Step 3), the vault provider prepares
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
 * (from the peg-in tx). Input 1 (from the assert tx) is signed by the vault provider.
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
   * Signs a Payout transaction and extracts the Schnorr signature.
   *
   * Flow:
   * 1. Vault provider submits Claim transaction
   * 2. Claimer submits Assert transaction to prove validity
   * 3. Payout can be executed (references Assert tx)
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
    // Validate payout TX outputs pay to the registered depositor payout address
    this.validatePayoutOutputs(
      params.payoutTxHex,
      params.registeredPayoutScriptPubKey,
    );

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
      timelockPegin: params.timelockPegin,
      network: this.config.network,
    });

    // Sign PSBT via wallet (Taproot script-path spend, input 0 only)
    const signedPsbtHex = await this.config.btcWallet.signPsbt(
      payoutPsbt.psbtHex,
      createTaprootScriptPathSignOptions(walletPubkeyRaw, 1),
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
   * Batch signs multiple payout transactions (1 per claimer).
   * This allows signing all transactions with a single wallet interaction.
   *
   * @param transactions - Array of payout params to sign
   * @returns Array of signature results matching input order
   * @throws Error if wallet doesn't support batch signing
   * @throws Error if any signing operation fails
   */
  async signPayoutTransactionsBatch(
    transactions: SignPayoutParams[],
  ): Promise<
    Array<{
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

    // Build all PSBTs (1 per claimer)
    const psbtsToSign: string[] = [];
    const signOptions: SignPsbtOptions[] = [];
    const depositorPubkeys: string[] = [];

    for (const tx of transactions) {
      // Validate payout TX outputs pay to the registered depositor payout address
      this.validatePayoutOutputs(
        tx.payoutTxHex,
        tx.registeredPayoutScriptPubKey,
      );

      // Validate wallet pubkey matches depositor
      const { depositorPubkey } = validateWalletPubkey(
        walletPubkeyRaw,
        tx.depositorBtcPubkey,
      );
      depositorPubkeys.push(depositorPubkey);

      // Build Payout PSBT
      const payoutPsbt = await buildPayoutPsbt({
        payoutTxHex: tx.payoutTxHex,
        peginTxHex: tx.peginTxHex,
        assertTxHex: tx.assertTxHex,
        depositorBtcPubkey: depositorPubkey,
        vaultProviderBtcPubkey: tx.vaultProviderBtcPubkey,
        vaultKeeperBtcPubkeys: tx.vaultKeeperBtcPubkeys,
        universalChallengerBtcPubkeys: tx.universalChallengerBtcPubkeys,
        timelockPegin: tx.timelockPegin,
        network: this.config.network,
      });
      psbtsToSign.push(payoutPsbt.psbtHex);
      signOptions.push(createTaprootScriptPathSignOptions(walletPubkeyRaw, 1));
    }

    // Batch sign all PSBTs with single wallet interaction
    const signedPsbts = await this.config.btcWallet.signPsbts!(
      psbtsToSign,
      signOptions,
    );

    // Validate that wallet returned the expected number of signed PSBTs
    if (signedPsbts.length !== transactions.length) {
      throw new Error(
        `Expected ${transactions.length} signed PSBTs but received ${signedPsbts.length}`,
      );
    }

    // Extract signatures from signed PSBTs
    const results: Array<{
      payoutSignature: string;
      depositorBtcPubkey: string;
    }> = [];

    for (let i = 0; i < transactions.length; i++) {
      const depositorPubkey = depositorPubkeys[i];
      const payoutSignature = extractPayoutSignature(
        signedPsbts[i],
        depositorPubkey,
      );

      results.push({
        payoutSignature,
        depositorBtcPubkey: depositorPubkey,
      });
    }

    return results;
  }

  /**
   * Validates that the payout transaction's largest output pays to the
   * registered depositor payout address (scriptPubKey).
   *
   * This prevents two attack vectors from a malicious vault provider:
   * 1. Substituting a completely different payout address
   * 2. Including a dust output to the correct address while routing
   *    the actual funds to an attacker-controlled address
   *
   * @param payoutTxHex - Raw payout transaction hex
   * @param registeredPayoutScriptPubKey - On-chain registered scriptPubKey (hex, with or without 0x prefix)
   * @throws Error if scriptPubKey is invalid hex
   * @throws Error if the largest output does not pay to the registered address
   */
  private validatePayoutOutputs(
    payoutTxHex: string,
    registeredPayoutScriptPubKey: string,
  ): void {
    if (!isValidHex(registeredPayoutScriptPubKey)) {
      throw new Error(
        "Invalid registeredPayoutScriptPubKey: not valid hex",
      );
    }

    const expectedScript = Buffer.from(
      stripHexPrefix(registeredPayoutScriptPubKey),
      "hex",
    );
    const payoutTx = Transaction.fromHex(stripHexPrefix(payoutTxHex));

    if (payoutTx.outs.length === 0) {
      throw new Error("Payout transaction has no outputs");
    }

    // Find the largest output by value — this must pay to the registered address.
    // A dust output to the correct address with funds routed elsewhere is rejected.
    const largestOutput = payoutTx.outs.reduce((max, output) =>
      output.value > max.value ? output : max,
    );

    if (!largestOutput.script.equals(expectedScript)) {
      throw new Error(
        "Payout transaction does not pay to the registered depositor payout address",
      );
    }
  }
}
