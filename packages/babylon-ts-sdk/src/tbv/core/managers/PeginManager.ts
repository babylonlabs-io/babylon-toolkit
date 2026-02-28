/**
 * Peg-in Manager - Wallet Orchestration for Peg-in Operations
 *
 * This module provides the PeginManager class that orchestrates the complete
 * peg-in flow using SDK primitives, utilities, and wallet interfaces.
 *
 * @remarks
 * PeginManager handles the first 2 steps and step 4 of the 4-step peg-in flow:
 * 1. **preparePegin()** - Build and fund the Bitcoin transaction
 * 2. **registerPeginOnChain()** - Submit to Ethereum contract with PoP
 * 3. *(Use {@link PayoutManager} for payout authorization signing - sign BOTH PayoutOptimistic and Payout)*
 * 4. **signAndBroadcast()** - Sign and broadcast to Bitcoin network
 *
 * @see {@link PayoutManager} - For Step 3: sign both PayoutOptimistic (optimistic path) and Payout (challenge path)
 * @see {@link buildPeginPsbt} - Lower-level primitive used internally
 *
 * @module managers/PeginManager
 */

import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  zeroAddress,
  type Address,
  type Chain,
  type Hex,
  type WalletClient,
} from "viem";

import type { BitcoinWallet } from "../../../shared/wallets/interfaces/BitcoinWallet";
import type { Hash } from "../../../shared/wallets/interfaces/EthereumWallet";
import { getUtxoInfo, pushTx } from "../clients/mempool";
import { BTCVaultsManagerABI, handleContractError } from "../contracts";
import { buildPeginPsbt, type Network } from "../primitives";
import { stripHexPrefix } from "../primitives/utils/bitcoin";
import {
  calculateBtcTxHash,
  fundPeginTransaction,
  getNetwork,
  getPsbtInputFields,
  selectUtxosForPegin,
  type UTXO,
} from "../utils";

/**
 * Configuration for the PeginManager.
 */
export interface PeginManagerConfig {
  /**
   * Bitcoin network to use for transactions.
   */
  btcNetwork: Network;

  /**
   * Bitcoin wallet for signing peg-in transactions.
   */
  btcWallet: BitcoinWallet;

  /**
   * Ethereum wallet for registering peg-in on-chain.
   * Uses viem's WalletClient directly for proper gas estimation.
   */
  ethWallet: WalletClient;

  /**
   * Ethereum chain configuration.
   * Required for proper gas estimation in contract calls.
   */
  ethChain: Chain;

  /**
   * Vault contract addresses.
   */
  vaultContracts: {
    /**
     * BTCVaultsManager contract address on Ethereum.
     */
    btcVaultsManager: Address;
  };

  /**
   * Mempool API URL for fetching UTXO data and broadcasting transactions.
   * Use MEMPOOL_API_URLS constant for standard mempool.space URLs, or provide
   * a custom URL if running your own mempool instance.
   */
  mempoolApiUrl: string;
}

/**
 * Parameters for creating a peg-in transaction.
 */
export interface CreatePeginParams {
  /**
   * Amount to peg in (in satoshis).
   */
  amount: bigint;

  /**
   * Vault provider's Ethereum address.
   */
  vaultProvider: Address;

  /**
   * Vault provider's BTC public key (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix (will be stripped automatically).
   */
  vaultProviderBtcPubkey: string;

  /**
   * Vault keeper BTC public keys (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix (will be stripped automatically).
   */
  vaultKeeperBtcPubkeys: string[];

  /**
   * Universal challenger BTC public keys (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix (will be stripped automatically).
   */
  universalChallengerBtcPubkeys: string[];

  /**
   * CSV timelock in blocks for the PegIn output.
   */
  timelockPegin: number;

  /**
   * Amount in satoshis for the depositor's claim output.
   */
  depositorClaimValue: bigint;

  /**
   * Available UTXOs from the depositor's wallet for funding the transaction.
   */
  availableUTXOs: UTXO[];

  /**
   * Fee rate in satoshis per vbyte for the transaction.
   */
  feeRate: number;

  /**
   * Bitcoin address for receiving change from the transaction.
   */
  changeAddress: string;
}

/**
 * Result of a peg-in preparation.
 */
export interface PeginResult {
  /**
   * Bitcoin transaction hash (without 0x prefix).
   * This is the hash of the unsigned transaction and will NOT change after signing.
   * Used as the unique vault identifier in the contract.
   */
  btcTxHash: string;

  /**
   * Funded but unsigned transaction hex.
   * This transaction has inputs and outputs but is not yet signed.
   */
  fundedTxHex: string;

  /**
   * Vault script pubkey hex.
   */
  vaultScriptPubKey: string;

  /**
   * UTXOs selected for funding the transaction.
   */
  selectedUTXOs: UTXO[];

  /**
   * Transaction fee in satoshis.
   */
  fee: bigint;

  /**
   * Change amount in satoshis (if any).
   */
  changeAmount: bigint;

  /**
   * Ethereum transaction hash (peg-in registration).
   * Will be null until registerPeginOnChain is called.
   */
  ethTxHash: Hash | null;
}

/**
 * Parameters for signing and broadcasting a transaction.
 */
export interface SignAndBroadcastParams {
  /**
   * Funded transaction hex from preparePegin().
   */
  fundedTxHex: string;

  /**
   * Depositor's BTC public key (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix.
   * Required for Taproot signing.
   */
  depositorBtcPubkey: string;
}

/**
 * Parameters for registering a peg-in on Ethereum.
 */
export interface RegisterPeginParams {
  /**
   * Depositor's BTC public key (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix.
   */
  depositorBtcPubkey: string;

  /**
   * Funded but unsigned BTC transaction hex.
   */
  unsignedBtcTx: string;

  /**
   * Vault provider's Ethereum address.
   */
  vaultProvider: Address;

  /**
   * Optional callback invoked after PoP signing completes but before ETH transaction.
   */
  onPopSigned?: () => void | Promise<void>;

  /** Keccak256 hash of the depositor's Lamport public key (bytes32) */
  depositorLamportPkHash?: Hex;

  /**
   * Pre-signed BTC PoP signature (hex with 0x prefix).
   * When provided, the BTC wallet signing step is skipped and this signature is used directly.
   * Useful for multi-vault deposits where PoP only needs to be signed once.
   */
  preSignedBtcPopSignature?: Hex;
}

/**
 * Result of registering a peg-in on Ethereum.
 */
export interface RegisterPeginResult {
  /**
   * Ethereum transaction hash for the peg-in registration.
   */
  ethTxHash: Hash;

  /**
   * Vault identifier used in the BTCVaultsManager contract.
   * This is the Bitcoin transaction hash with 0x prefix for Ethereum compatibility.
   * Corresponds to btcTxHash from PeginResult, but formatted as Hex with '0x' prefix.
   */
  vaultId: Hex;

  /**
   * The BTC PoP signature used for this registration (hex with 0x prefix).
   * Returned so callers can reuse it for subsequent pegins without re-signing.
   */
  btcPopSignature: Hex;
}

/**
 * Manager for orchestrating peg-in operations.
 *
 * This manager provides a high-level API for creating peg-in transactions
 * by coordinating between SDK primitives, utilities, and wallet interfaces.
 *
 * @remarks
 * The complete peg-in flow consists of 4 steps:
 *
 * | Step | Method | Description |
 * |------|--------|-------------|
 * | 1 | {@link preparePegin} | Build and fund the transaction |
 * | 2 | {@link registerPeginOnChain} | Submit to Ethereum contract with PoP |
 * | 3 | {@link PayoutManager} | Sign BOTH payout authorizations |
 * | 4 | {@link signAndBroadcast} | Sign and broadcast to Bitcoin network |
 *
 * **Important:** Step 3 uses {@link PayoutManager}, not this class. After step 2,
 * the vault provider prepares 4 transactions per claimer:
 * - `claim_tx` - Claim transaction
 * - `payout_optimistic_tx` - PayoutOptimistic transaction
 * - `assert_tx` - Assert transaction
 * - `payout_tx` - Payout transaction
 *
 * You must sign **BOTH** PayoutOptimistic and Payout transactions for each claimer:
 * - {@link PayoutManager.signPayoutOptimisticTransaction} - uses claim_tx as input reference
 * - {@link PayoutManager.signPayoutTransaction} - uses assert_tx as input reference
 *
 * Submit all signatures to the vault provider before proceeding to step 4.
 *
 * @see {@link PayoutManager} - Required for Step 3 (payout authorization)
 * @see {@link buildPeginPsbt} - Lower-level primitive for custom implementations
 * @see {@link https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/managers.md | Managers Quickstart}
 */
export class PeginManager {
  private readonly config: PeginManagerConfig;

  /**
   * Creates a new PeginManager instance.
   *
   * @param config - Manager configuration including wallets and contract addresses
   */
  constructor(config: PeginManagerConfig) {
    this.config = config;
  }

  /**
   * Prepares a peg-in transaction by building and funding it.
   *
   * This method orchestrates the following steps:
   * 1. Get depositor BTC public key from wallet
   * 2. Build unfunded PSBT using primitives
   * 3. Select UTXOs using iterative fee calculation
   * 4. Fund transaction by adding inputs and change output
   *
   * The returned transaction is funded but unsigned. Use `signAndBroadcast()`
   * to complete the Bitcoin side, and `registerPeginOnChain()` for Ethereum.
   *
   * @param params - Peg-in parameters including amount, provider, UTXOs, and fee rate
   * @returns Peg-in result with funded transaction and selection details
   * @throws Error if wallet operations fail or insufficient funds
   */
  async preparePegin(params: CreatePeginParams): Promise<PeginResult> {
    // Step 1: Get depositor BTC public key from wallet
    const depositorBtcPubkeyRaw = await this.config.btcWallet.getPublicKeyHex();
    // Convert 33-byte compressed (66 chars) to 32-byte x-only (64 chars) if needed
    const depositorBtcPubkey =
      depositorBtcPubkeyRaw.length === 66
        ? depositorBtcPubkeyRaw.slice(2) // Strip first byte (02 or 03)
        : depositorBtcPubkeyRaw; // Already x-only

    // Strip "0x" prefix from BTC public keys if present
    const vaultProviderBtcPubkey = stripHexPrefix(params.vaultProviderBtcPubkey);
    const vaultKeeperBtcPubkeys = params.vaultKeeperBtcPubkeys.map(stripHexPrefix);
    const universalChallengerBtcPubkeys =
      params.universalChallengerBtcPubkeys.map(stripHexPrefix);

    // Step 2: Build unfunded PSBT using primitives
    // This creates a transaction with 0 inputs and 1 output (the vault output)
    const peginPsbt = await buildPeginPsbt({
      depositorPubkey: depositorBtcPubkey,
      vaultProviderPubkey: vaultProviderBtcPubkey,
      vaultKeeperPubkeys: vaultKeeperBtcPubkeys,
      universalChallengerPubkeys: universalChallengerBtcPubkeys,
      timelockPegin: params.timelockPegin,
      pegInAmount: params.amount,
      depositorClaimValue: params.depositorClaimValue,
      network: this.config.btcNetwork,
    });

    // Step 3: Select UTXOs using iterative fee calculation
    // Total output value includes both vault amount and depositor claim value
    const totalOutputValue = params.amount + params.depositorClaimValue;
    const utxoSelection = selectUtxosForPegin(
      params.availableUTXOs,
      totalOutputValue,
      params.feeRate,
    );

    // Step 4: Fund the transaction by adding inputs and change output
    const network = getNetwork(this.config.btcNetwork);
    const fundedTxHex = fundPeginTransaction({
      unfundedTxHex: peginPsbt.psbtHex,
      selectedUTXOs: utxoSelection.selectedUTXOs,
      changeAddress: params.changeAddress,
      changeAmount: utxoSelection.changeAmount,
      network,
    });

    return {
      btcTxHash: peginPsbt.txid,
      fundedTxHex,
      vaultScriptPubKey: peginPsbt.vaultScriptPubKey,
      selectedUTXOs: utxoSelection.selectedUTXOs,
      fee: utxoSelection.fee,
      changeAmount: utxoSelection.changeAmount,
      ethTxHash: null,
    };
  }

  /**
   * Signs and broadcasts a funded peg-in transaction to the Bitcoin network.
   *
   * This method:
   * 1. Parses the funded transaction hex
   * 2. Fetches UTXO data from mempool for each input
   * 3. Creates a PSBT with proper witnessUtxo/tapInternalKey
   * 4. Signs via btcWallet.signPsbt()
   * 5. Finalizes and extracts the transaction
   * 6. Broadcasts via mempool API
   *
   * @param params - Transaction hex and depositor public key
   * @returns The broadcasted Bitcoin transaction ID
   * @throws Error if signing or broadcasting fails
   */
  async signAndBroadcast(params: SignAndBroadcastParams): Promise<string> {
    const { fundedTxHex, depositorBtcPubkey } = params;

    // Step 1: Parse the funded transaction
    const cleanHex = fundedTxHex.startsWith("0x")
      ? fundedTxHex.slice(2)
      : fundedTxHex;
    const tx = Transaction.fromHex(cleanHex);

    if (tx.ins.length === 0) {
      throw new Error("Transaction has no inputs");
    }

    // Step 2: Create PSBT and add inputs with UTXO data from mempool
    const psbt = new Psbt();
    psbt.setVersion(tx.version);
    psbt.setLocktime(tx.locktime);

    // Strip 0x prefix if present before converting to Buffer
    const cleanPubkey = depositorBtcPubkey.startsWith("0x")
      ? depositorBtcPubkey.slice(2)
      : depositorBtcPubkey;
    // Validate x-only pubkey length and format (32 bytes = 64 hex chars)
    if (cleanPubkey.length !== 64 || !/^[0-9a-fA-F]+$/.test(cleanPubkey)) {
      throw new Error(
        "Invalid depositorBtcPubkey: expected 64 hex characters (x-only pubkey)",
      );
    }
    const publicKeyNoCoord = Buffer.from(cleanPubkey, "hex");
    if (publicKeyNoCoord.length !== 32) {
      throw new Error(
        `Invalid depositorBtcPubkey length: expected 32 bytes, got ${publicKeyNoCoord.length}`,
      );
    }
    const apiUrl = this.config.mempoolApiUrl;

    // Fetch all UTXO data in parallel for better performance
    const utxoDataPromises = tx.ins.map((input) => {
      const txid = Buffer.from(input.hash).reverse().toString("hex");
      const vout = input.index;
      return getUtxoInfo(txid, vout, apiUrl).then((utxoData) => ({
        input,
        utxoData,
        txid,
        vout,
      }));
    });

    const inputsWithUtxoData = await Promise.all(utxoDataPromises);

    // Add inputs with proper PSBT fields based on script type
    for (const { input, utxoData, txid, vout } of inputsWithUtxoData) {
      const psbtInputFields = getPsbtInputFields(
        {
          txid,
          vout,
          value: utxoData.value,
          scriptPubKey: utxoData.scriptPubKey,
        },
        publicKeyNoCoord,
      );

      psbt.addInput({
        hash: input.hash,
        index: input.index,
        sequence: input.sequence,
        ...psbtInputFields,
      });
    }

    // Step 3: Add outputs
    for (const output of tx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    // Step 4: Sign PSBT via wallet
    const signedPsbtHex = await this.config.btcWallet.signPsbt(psbt.toHex());
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    // Step 5: Finalize and extract transaction
    try {
      signedPsbt.finalizeAllInputs();
    } catch {
      // Some wallets finalize automatically, ignore errors
    }

    const signedTxHex = signedPsbt.extractTransaction().toHex();

    // Step 6: Broadcast to Bitcoin network
    const btcTxid = await pushTx(signedTxHex, apiUrl);

    return btcTxid;
  }

  /**
   * Registers a peg-in on Ethereum by calling the BTCVaultsManager contract.
   *
   * This method:
   * 1. Gets depositor ETH address from wallet
   * 2. Creates proof of possession (BTC signature of ETH address)
   * 3. Checks if vault already exists (pre-flight check)
   * 4. Encodes the contract call using viem
   * 5. Estimates gas (catches contract errors early with proper revert reasons)
   * 6. Sends transaction with pre-estimated gas via ethWallet.sendTransaction()
   *
   * @param params - Registration parameters including BTC pubkey and unsigned tx
   * @returns Result containing Ethereum transaction hash and vault ID
   * @throws Error if signing or transaction fails
   * @throws Error if vault already exists
   * @throws Error if contract simulation fails (e.g., invalid signature, unauthorized)
   */
  async registerPeginOnChain(
    params: RegisterPeginParams,
  ): Promise<RegisterPeginResult> {
    const {
      depositorBtcPubkey,
      unsignedBtcTx,
      vaultProvider,
      onPopSigned,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      depositorLamportPkHash,
      preSignedBtcPopSignature,
    } = params;

    // Step 1: Get depositor ETH address (from wallet account)
    if (!this.config.ethWallet.account) {
      throw new Error("Ethereum wallet account not found");
    }
    const depositorEthAddress = this.config.ethWallet.account.address;

    // Step 2: Create proof of possession (or reuse pre-signed one)
    let btcPopSignature: Hex;
    if (preSignedBtcPopSignature) {
      // Reuse a previously signed PoP (e.g. multi-vault deposit)
      btcPopSignature = preSignedBtcPopSignature;
    } else {
      // The depositor signs a message with their BTC key using BIP-322 simple
      // Message format: "<eth_address>:<chainId>:<action>:<verifying_contract>"
      // This matches BTCProofOfPossession.sol buildMessage() format
      // Addresses already include 0x prefix and must be lowercase
      // Action is "pegin" for peg-in operations
      const verifyingContract = this.config.vaultContracts.btcVaultsManager;
      const popMessage = `${depositorEthAddress.toLowerCase()}:${this.config.ethChain.id}:pegin:${verifyingContract.toLowerCase()}`;
      const btcPopSignatureRaw = await this.config.btcWallet.signMessage(
        popMessage,
        "bip322-simple",
      );

      // Convert PoP signature to hex format
      // BTC wallets return base64, Ethereum contracts expect hex
      if (btcPopSignatureRaw.startsWith("0x")) {
        btcPopSignature = btcPopSignatureRaw as Hex;
      } else {
        const signatureBytes = Buffer.from(btcPopSignatureRaw, "base64");
        btcPopSignature = `0x${signatureBytes.toString("hex")}` as Hex;
      }
    }

    if (onPopSigned) {
      await onPopSigned();
    }

    // Step 3: Format parameters for contract call
    // Ensure depositor BTC pubkey is 32 bytes (bytes32)
    const depositorBtcPubkeyHex = depositorBtcPubkey.startsWith("0x")
      ? (depositorBtcPubkey as Hex)
      : (`0x${depositorBtcPubkey}` as Hex);

    // Ensure unsigned tx has 0x prefix
    const unsignedPegInTx = unsignedBtcTx.startsWith("0x")
      ? (unsignedBtcTx as Hex)
      : (`0x${unsignedBtcTx}` as Hex);

    // Step 4: Calculate vault ID and check if it already exists (pre-flight check)
    const vaultId = calculateBtcTxHash(unsignedPegInTx);
    const exists = await this.checkVaultExists(vaultId);

    if (exists) {
      throw new Error(
        `Vault already exists for this transaction (ID: ${vaultId}). ` +
          `Vault IDs are deterministically derived from the unsigned Bitcoin transaction, so using the same UTXOs and amount will always produce the same vault. ` +
          `To create a new vault, please use different UTXOs or a different amount to generate a unique transaction.`,
      );
    }

    // TODO: Pass depositorLamportPkHash as the 6th arg to submitPeginRequest
    // once the next contract upgrade adds the parameter.

    // Step 5: Query required pegin fee from the contract
    const publicClient = createPublicClient({
      chain: this.config.ethChain,
      transport: http(),
    });

    let peginFee: bigint;
    try {
      peginFee = (await publicClient.readContract({
        address: this.config.vaultContracts.btcVaultsManager,
        abi: BTCVaultsManagerABI,
        functionName: "getPegInFee",
        args: [vaultProvider],
      })) as bigint;
    } catch {
      throw new Error(
        "Failed to query pegin fee from the contract. " +
          "Please check your network connection and that the contract address is correct.",
      );
    }

    // Step 6: Encode the contract call data
    const callData = encodeFunctionData({
      abi: BTCVaultsManagerABI,
      functionName: "submitPeginRequest",
      args: [
        depositorEthAddress,
        depositorBtcPubkeyHex,
        btcPopSignature,
        unsignedPegInTx,
        vaultProvider,
      ],
    });

    // Step 7: Estimate gas first to catch contract errors before showing wallet popup
    // This ensures users see actual contract revert reasons instead of gas errors
    // The gas estimate is then passed to sendTransaction to avoid double estimation
    let gasEstimate: bigint;
    try {
      gasEstimate = await publicClient.estimateGas({
        to: this.config.vaultContracts.btcVaultsManager,
        data: callData,
        value: peginFee,
        account: this.config.ethWallet.account.address,
      });
    } catch (error) {
      // Estimation failed - handle contract error with actual revert reason
      handleContractError(error);
    }

    // Step 8: Submit peg-in request to contract (estimation passed)
    try {
      // Send transaction with pre-estimated gas to skip internal estimation
      // Note: viem's sendTransaction uses `gas`, not `gasLimit`
      const ethTxHash = await this.config.ethWallet.sendTransaction({
        to: this.config.vaultContracts.btcVaultsManager,
        data: callData,
        value: peginFee,
        account: this.config.ethWallet.account,
        chain: this.config.ethChain,
        gas: gasEstimate,
      });

      return {
        ethTxHash,
        vaultId,
        btcPopSignature,
      };
    } catch (error) {
      // Use proper error handler for better error messages
      handleContractError(error);
    }
  }

  /**
   * Check if a vault already exists for a given vault ID.
   *
   * @param vaultId - The Bitcoin transaction hash (vault ID)
   * @returns True if vault exists, false otherwise
   */
  private async checkVaultExists(vaultId: Hex): Promise<boolean> {
    try {
      // Create a public client to read from the contract
      const publicClient = createPublicClient({
        chain: this.config.ethChain,
        transport: http(),
      });

      const vault = (await publicClient.readContract({
        address: this.config.vaultContracts.btcVaultsManager,
        abi: BTCVaultsManagerABI,
        functionName: "getBTCVault",
        args: [vaultId],
      })) as { depositor: Address };

      // If depositor is not zero address, vault exists
      return vault.depositor !== zeroAddress;
    } catch {
      // If reading fails, assume vault doesn't exist and let contract handle it
      return false;
    }
  }

  /**
   * Gets the configured Bitcoin network.
   *
   * @returns The Bitcoin network (mainnet, testnet, signet, regtest)
   */
  getNetwork(): Network {
    return this.config.btcNetwork;
  }

  /**
   * Gets the configured BTCVaultsManager contract address.
   *
   * @returns The Ethereum address of the BTCVaultsManager contract
   */
  getVaultContractAddress(): Address {
    return this.config.vaultContracts.btcVaultsManager;
  }
}
