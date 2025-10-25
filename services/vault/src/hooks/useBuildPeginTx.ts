/**
 * Hook for building peg-in transactions with multiple UTXO support.
 *
 * This hook orchestrates the complete flow:
 * 1. Get unfunded transaction from WASM
 * 2. Select UTXOs to fund the transaction
 * 3. Calculate fees
 * 4. Build a transaction hex ready for wallet signing
 *
 * Note: Returns transaction hex (not PSBT), as we manually extract vault output
 * from WASM since bitcoinjs-lib cannot parse 0-input transactions.
 */

import {
  createPegInTransaction,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { useState } from "react";

import {
  buildPeginPsbt,
  getNetwork,
} from "../utils/transaction/buildPeginPsbt";
import { selectUtxosForPegin, type UTXO } from "../utils/utxo/selectUtxos";

export interface UseBuildPeginTxParams {
  /** X-only public key of the depositor (hex encoded) */
  depositorPubkey: string;
  /** X-only public key of the claimer/vault provider (hex encoded) */
  claimerPubkey: string;
  /** Array of x-only public keys of challengers (hex encoded) */
  challengerPubkeys: string[];
  /** Amount to peg-in in satoshis */
  peginAmount: bigint;
  /** Bitcoin network */
  network: Network;
}

export interface BuildPeginTxOptions {
  /** Available UTXOs from wallet */
  availableUTXOs: UTXO[];
  /** Fee rate in sat/vbyte */
  feeRate: number;
  /** Change address from wallet */
  changeAddress: string;
}

export interface UseBuildPeginTxResult {
  /**
   * Builds a peg-in transaction ready for wallet signing.
   *
   * @param options - Build options (UTXOs, fee rate, change address)
   * @returns Transaction hex string (not PSBT)
   */
  buildPeginTx: (options: BuildPeginTxOptions) => Promise<string>;
  /** Whether the transaction is currently being built */
  isBuilding: boolean;
  /** Error if transaction building failed */
  error: Error | null;
}

/**
 * Hook for building peg-in transactions.
 *
 * Usage:
 * ```typescript
 * const { buildPeginTx, isBuilding, error } = useBuildPeginTx({
 *   depositorPubkey: "abc123...",
 *   claimerPubkey: "def456...",
 *   challengerPubkeys: ["ghi789..."],
 *   peginAmount: 1000000n,
 *   network: "testnet"
 * });
 *
 * // Later, when ready to build:
 * const txHex = await buildPeginTx({
 *   availableUTXOs: utxosFromWallet,
 *   feeRate: 10,
 *   changeAddress: walletChangeAddress
 * });
 *
 * // Sign transaction via wallet
 * const signedTxHex = await wallet.signTransaction(txHex);
 * ```
 *
 * @param params - Peg-in parameters
 * @returns Hook result with buildPeginTx function and state
 */
export function useBuildPeginTx(
  params: UseBuildPeginTxParams,
): UseBuildPeginTxResult {
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const buildPeginTx = async (
    options: BuildPeginTxOptions,
  ): Promise<string> => {
    setIsBuilding(true);
    setError(null);

    try {
      const { availableUTXOs, feeRate, changeAddress } = options;

      // Step 1: Get unfunded transaction from WASM
      // This creates a tx with 0 inputs and 1 output (the pegin output)
      const unfundedTxResult = await createPegInTransaction({
        depositorPubkey: params.depositorPubkey,
        claimerPubkey: params.claimerPubkey,
        challengerPubkeys: params.challengerPubkeys,
        pegInAmount: params.peginAmount,
        network: params.network,
      });

      // Step 2: Select UTXOs with iterative fee calculation
      // This function internally:
      // - Filters for script validity
      // - Sorts by value (largest first)
      // - Iteratively selects UTXOs and recalculates fee
      // - Returns selected UTXOs, calculated fee, and change amount
      const selectionResult = selectUtxosForPegin(
        availableUTXOs,
        params.peginAmount,
        feeRate,
      );

      const { selectedUTXOs, changeAmount } = selectionResult;

      // Step 3: Build transaction hex
      const network = getNetwork(params.network);
      const txHex = buildPeginPsbt({
        unfundedTxHex: unfundedTxResult.txHex,
        selectedUTXOs,
        changeAddress,
        changeAmount,
        network,
      });

      return txHex;
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error("Unknown error building transaction");
      setError(error);
      throw error;
    } finally {
      setIsBuilding(false);
    }
  };

  return {
    buildPeginTx,
    isBuilding,
    error,
  };
}
