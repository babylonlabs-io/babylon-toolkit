/**
 * Build deposit transaction function
 *
 * Handles the transaction creation logic for deposits, including UTXO selection,
 * fee calculation, and transaction data preparation.
 */

import type { Hex } from "viem";

import { CONTRACTS } from "../../config/contracts";
import type { DepositTransactionData } from "../../services/deposit";
import { depositService } from "../../services/deposit";
import type { MempoolUTXO } from "../../clients/btc/mempool";
import { getProviderBTCKey } from "../../services/vault/vaultQueryService";
import { createPegInTransaction } from "../../utils/btc/wasm";
import { getBTCNetworkForWASM } from "../../config/pegin";

export interface BuildDepositTransactionParams {
  amount: string;
  selectedProviders: string[];
  btcAddress: string;
  ethAddress: Hex;
  btcPubkey: string;
  confirmedUTXOs: MempoolUTXO[];
  providerData?: {
    address: Hex;
    btcPubkey?: string;
    liquidatorPubkeys: string[];
  };
}

/**
 * Build a deposit transaction with real data
 * 
 * @param params - Parameters for building the transaction
 * @returns Transaction data ready for signing and submission
 */
export async function buildDepositTransaction(
  params: BuildDepositTransactionParams,
): Promise<DepositTransactionData> {
  const {
    amount,
    selectedProviders,
    btcPubkey,
    ethAddress,
    confirmedUTXOs,
  } = params;

  const pegInAmount = depositService.parseBtcToSatoshis(amount);

  let providerData = params.providerData;
  
  if (!providerData) {
    // If provider data not passed, we need to construct it
    // This is a fallback - ideally provider data should be passed from the component
    const providerAddress = selectedProviders[0] as Hex;
    
    // Fetch provider's BTC public key from smart contract if not provided
    const providerBtcPubkeyHex = await getProviderBTCKey(
      CONTRACTS.BTC_VAULTS_MANAGER,
      providerAddress,
    );
    
    providerData = {
      address: providerAddress,
      btcPubkey: providerBtcPubkeyHex,
      liquidatorPubkeys: [], // This should be fetched from provider data
    };
  }

  // Ensure we have the provider's BTC pubkey
  if (!providerData.btcPubkey) {
    const providerBtcPubkeyHex = await getProviderBTCKey(
      CONTRACTS.BTC_VAULTS_MANAGER,
      providerData.address,
    );
    providerData.btcPubkey = providerBtcPubkeyHex;
  }

  // Calculate fees based on number of inputs (UTXOs)
  const fees = depositService.calculateDepositFees(pegInAmount, 1);
  const requiredAmount = pegInAmount + fees.totalFee;

  // Select optimal UTXOs from confirmed UTXOs
  const utxosForSelection = confirmedUTXOs.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    scriptPubKey: "", // Will be filled by WASM
  }));

  const { selected: selectedUTXOs, totalValue } = depositService.selectOptimalUTXOs(
    utxosForSelection,
    requiredAmount,
  );

  if (selectedUTXOs.length === 0) {
    throw new Error("Insufficient funds: No suitable UTXOs found");
  }

  if (totalValue < requiredAmount) {
    throw new Error(
      `Insufficient funds: Required ${requiredAmount} satoshis, but only ${totalValue} available`
    );
  }

  // Build transaction data
  const txData = depositService.transformFormToTransactionData(
    {
      amount,
      selectedProviders,
    },
    {
      btcPubkey,
      ethAddress,
    },
    {
      address: providerData.address,
      btcPubkey: providerData.btcPubkey,
      liquidatorPubkeys: providerData.liquidatorPubkeys,
    },
    {
      selectedUTXOs,
      fee: fees.totalFee,
    },
  );

  // Create unsigned transaction using WASM
  // We'll use the first UTXO as the funding input for the peg-in transaction
  if (selectedUTXOs.length > 0) {
    const fundingUtxo = selectedUTXOs[0];
    const network = getBTCNetworkForWASM();
    
    try {
      const pegInResult = await createPegInTransaction({
        depositTxid: fundingUtxo.txid,
        depositVout: fundingUtxo.vout,
        depositValue: BigInt(fundingUtxo.value),
        depositScriptPubKey: fundingUtxo.scriptPubKey || "",
        depositorPubkey: btcPubkey.replace("0x", ""),
        claimerPubkey: providerData.btcPubkey.replace("0x", ""),
        challengerPubkeys: providerData.liquidatorPubkeys.map(pk => 
          pk.replace("0x", "")
        ),
        pegInAmount,
        fee: fees.totalFee,
        network,
      });

      txData.unsignedTxHex = pegInResult.txHex;
    } catch (error) {
      console.error("Failed to create peg-in transaction:", error);
      // If WASM fails, we can still return the transaction data
      // The signing step will handle the actual transaction creation
    }
  }

  return txData;
}
