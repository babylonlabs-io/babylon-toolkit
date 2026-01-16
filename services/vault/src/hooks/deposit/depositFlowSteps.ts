/**
 * Pure functions for deposit flow steps
 *
 * These functions contain the business logic for each step of the deposit flow.
 * They are pure (no React state) and can be easily tested.
 * The useDepositFlow hook orchestrates these functions and manages state.
 */

import { getETHChain } from "@babylonlabs-io/config";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import type { Address, Hex, WalletClient } from "viem";
import {
  getWalletClient,
  switchChain,
  waitForTransactionReceipt,
} from "wagmi/actions";

import type { ClaimerTransactions } from "@/clients/vault-provider-rpc/types";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { depositService } from "@/services/deposit";
import {
  pollForPayoutTransactions,
  waitForContractVerification,
} from "@/services/deposit/polling";
import { broadcastPeginTransaction, fetchVaultById } from "@/services/vault";
import {
  prepareSigningContext,
  prepareTransactionsForSigning,
  submitSignaturesToVaultProvider,
  type PreparedTransaction,
  type SigningContext,
} from "@/services/vault/vaultPayoutSignatureService";
import { submitPeginRequest } from "@/services/vault/vaultTransactionService";
import {
  addPendingPegin,
  updatePendingPeginStatus,
} from "@/storage/peginStorage";
import { processPublicKeyToXOnly } from "@/utils/btc";

// ============================================================================
// Types
// ============================================================================

export interface DepositValidationParams {
  btcAddress: string | undefined;
  depositorEthAddress: Address | undefined;
  amount: bigint;
  selectedProviders: string[];
  confirmedUTXOs: Array<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
  }> | null;
  isUTXOsLoading: boolean;
  utxoError: Error | null;
  /** Vault keeper BTC public keys - required for Taproot script */
  vaultKeeperBtcPubkeys: string[];
  /** Universal challenger BTC public keys - required for Taproot script */
  universalChallengerBtcPubkeys: string[];
}

export interface PeginSubmitParams {
  btcWalletProvider: BitcoinWallet;
  walletClient: WalletClient;
  amount: bigint;
  feeRate: number;
  btcAddress: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  confirmedUTXOs: Array<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
  }>;
  onPopSigned?: () => void;
}

export interface PeginSubmitResult {
  btcTxid: string;
  ethTxHash: Hex;
  depositorBtcPubkey: string;
  btcTxHex: string;
  selectedUTXOs: Array<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
  }>;
  fee: bigint;
}

export interface PayoutSigningParams {
  btcTxid: string;
  depositorBtcPubkey: string;
  providerUrl: string;
  providerId: Hex;
  providerBtcPubKey: string;
  vaultKeepers: Array<{ btcPubKey: string }>;
  universalChallengers: Array<{ btcPubKey: string }>;
}

export interface PayoutSigningContext {
  context: SigningContext;
  vaultProviderUrl: string;
  preparedTransactions: PreparedTransaction[];
}

export interface BroadcastParams {
  btcTxid: string;
  depositorBtcPubkey: string;
  btcWalletProvider: BitcoinWallet;
}

// ============================================================================
// Step 0: Validation
// ============================================================================

/**
 * Validate all deposit inputs before starting the flow.
 * Throws an error if any validation fails.
 */
export function validateDepositInputs(params: DepositValidationParams): void {
  const {
    btcAddress,
    depositorEthAddress,
    amount,
    selectedProviders,
    confirmedUTXOs,
    isUTXOsLoading,
    utxoError,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  } = params;

  if (!btcAddress) {
    throw new Error("BTC wallet not connected");
  }
  if (!depositorEthAddress) {
    throw new Error("ETH wallet not connected");
  }

  const amountValidation = depositService.validateDepositAmount(
    amount,
    10000n, // MIN_DEPOSIT
    21000000_00000000n, // MAX_DEPOSIT
  );
  if (!amountValidation.valid) {
    throw new Error(amountValidation.error);
  }

  if (selectedProviders.length === 0) {
    throw new Error("No providers selected");
  }

  // Validate vault keepers - required for Taproot script construction
  if (!vaultKeeperBtcPubkeys || vaultKeeperBtcPubkeys.length === 0) {
    throw new Error(
      "No vault keepers available. The system requires at least one vault keeper to create a deposit.",
    );
  }

  // Validate universal challengers - required for Taproot script construction
  if (
    !universalChallengerBtcPubkeys ||
    universalChallengerBtcPubkeys.length === 0
  ) {
    throw new Error(
      "No universal challengers available. The system requires at least one universal challenger to create a deposit.",
    );
  }

  if (isUTXOsLoading) {
    throw new Error("Loading UTXOs...");
  }
  if (utxoError) {
    throw new Error(`Failed to load UTXOs: ${utxoError.message}`);
  }
  if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
    throw new Error("No confirmed UTXOs available");
  }
}

// ============================================================================
// Step 1: Get ETH Wallet Client
// ============================================================================

/**
 * Get ETH wallet client, switching chain if needed.
 */
export async function getEthWalletClient(
  depositorEthAddress: Address,
): Promise<WalletClient> {
  const wagmiConfig = getSharedWagmiConfig();
  const expectedChainId = getETHChain().id;

  try {
    await switchChain(wagmiConfig, { chainId: expectedChainId });
  } catch (switchError) {
    console.error("Failed to switch chain:", switchError);
    throw new Error(
      `Please switch to ${expectedChainId === 1 ? "Ethereum Mainnet" : "Sepolia Testnet"} in your wallet`,
    );
  }

  const walletClient = await getWalletClient(wagmiConfig, {
    chainId: expectedChainId,
    account: depositorEthAddress,
  });

  if (!walletClient) {
    throw new Error("Failed to get wallet client");
  }

  return walletClient;
}

// ============================================================================
// Step 1-2: Submit Pegin Request
// ============================================================================

/**
 * Submit pegin request (PoP signature + ETH transaction).
 * Returns transaction details after ETH confirmation.
 */
export async function submitPeginAndWait(
  params: PeginSubmitParams,
): Promise<PeginSubmitResult> {
  const {
    btcWalletProvider,
    walletClient,
    amount,
    feeRate,
    btcAddress,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    confirmedUTXOs,
    onPopSigned,
  } = params;

  // Submit pegin request
  const result = await submitPeginRequest(btcWalletProvider, walletClient, {
    pegInAmount: amount,
    feeRate,
    changeAddress: btcAddress,
    vaultProviderAddress: selectedProviders[0] as Address,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    availableUTXOs: confirmedUTXOs,
    onPopSigned,
  });

  // Get depositor's BTC public key
  const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
  const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

  const btcTxid = result.btcTxHash;
  const ethTxHash = result.transactionHash;

  // Wait for ETH transaction confirmation
  const wagmiConfig = getSharedWagmiConfig();
  try {
    await waitForTransactionReceipt(wagmiConfig, {
      hash: ethTxHash,
      confirmations: 1,
    });
  } catch {
    throw new Error(
      `ETH transaction not confirmed. It may have been dropped or replaced. ` +
        `Please check your wallet and retry. Hash: ${ethTxHash}`,
    );
  }

  return {
    btcTxid,
    ethTxHash,
    depositorBtcPubkey,
    btcTxHex: result.btcTxHex,
    selectedUTXOs: result.selectedUTXOs,
    fee: result.fee,
  };
}

/**
 * Save pending pegin to localStorage.
 */
export function savePendingPegin(
  depositorEthAddress: Address,
  btcTxid: string,
  ethTxHash: string,
  amount: bigint,
  selectedProviders: string[],
  applicationController: string,
  unsignedTxHex: string,
  selectedUTXOs: Array<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
  }>,
): void {
  const amountBtc = depositService.formatSatoshisToBtc(amount);

  addPendingPegin(depositorEthAddress, {
    id: btcTxid,
    amount: amountBtc,
    providerIds: selectedProviders,
    applicationController,
    status: LocalStorageStatus.PENDING,
    btcTxHash: ethTxHash,
    unsignedTxHex,
    selectedUTXOs: selectedUTXOs.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value.toString(),
      scriptPubKey: utxo.scriptPubKey,
    })),
  });
}

// ============================================================================
// Step 3: Poll and Prepare Payout Signing
// ============================================================================

/**
 * Poll for payout transactions and prepare signing context.
 */
export async function pollAndPreparePayoutSigning(
  params: PayoutSigningParams,
): Promise<PayoutSigningContext> {
  const {
    btcTxid,
    depositorBtcPubkey,
    providerUrl,
    providerId,
    providerBtcPubKey,
    vaultKeepers,
    universalChallengers,
  } = params;

  // Poll for payout transactions
  const payoutTransactions: ClaimerTransactions[] =
    await pollForPayoutTransactions({
      btcTxid,
      depositorBtcPubkey,
      providerUrl,
    });

  // Prepare signing context
  const { context, vaultProviderUrl } = await prepareSigningContext({
    peginTxId: btcTxid,
    depositorBtcPubkey,
    providers: {
      vaultProvider: {
        address: providerId,
        url: providerUrl,
        btcPubKey: providerBtcPubKey,
      },
      vaultKeepers,
      universalChallengers,
    },
  });

  // Prepare transactions
  const preparedTransactions =
    prepareTransactionsForSigning(payoutTransactions);

  return {
    context,
    vaultProviderUrl,
    preparedTransactions,
  };
}

/**
 * Submit payout signatures to vault provider.
 */
export async function submitPayoutSignatures(
  vaultProviderUrl: string,
  btcTxid: string,
  depositorBtcPubkey: string,
  signatures: Record<
    string,
    { payout_optimistic_signature: string; payout_signature: string }
  >,
  depositorEthAddress: Address,
): Promise<void> {
  await submitSignaturesToVaultProvider(
    vaultProviderUrl,
    btcTxid,
    depositorBtcPubkey,
    signatures,
  );

  updatePendingPeginStatus(
    depositorEthAddress,
    btcTxid,
    LocalStorageStatus.PAYOUT_SIGNED,
  );
}

// ============================================================================
// Step 4: Wait for Verification and Broadcast
// ============================================================================

/**
 * Wait for contract verification and broadcast BTC transaction.
 * Returns the broadcast transaction ID.
 */
export async function waitAndBroadcast(
  params: BroadcastParams,
  depositorEthAddress: Address,
): Promise<string> {
  const { btcTxid, depositorBtcPubkey, btcWalletProvider } = params;

  // Wait for contract verification
  await waitForContractVerification({ btcTxid });

  // Fetch vault to get unsigned tx
  const vault = await fetchVaultById(btcTxid as Hex);
  if (!vault?.unsignedBtcTx) {
    throw new Error("Vault or unsigned transaction not found");
  }

  // Broadcast BTC transaction
  const broadcastTxId = await broadcastPeginTransaction({
    unsignedTxHex: vault.unsignedBtcTx,
    btcWalletProvider: {
      signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
    },
    depositorBtcPubkey,
  });

  // Update localStorage
  updatePendingPeginStatus(
    depositorEthAddress,
    btcTxid,
    LocalStorageStatus.CONFIRMING,
    broadcastTxId,
  );

  return broadcastTxId;
}
