/**
 * Hook to build an unsigned pegin transaction for fee estimation purposes.
 * Extracts transaction building logic from useDepositReviewData for better separation of concerns.
 */

import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import {
  buildPeginPsbt,
  fundPeginTransaction,
  getNetwork,
  selectUtxosForPegin,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { useQuery } from "@tanstack/react-query";

import { getBTCNetworkForWASM } from "../../config/pegin";

export interface UnsignedPeginTxParams {
  /** Deposit amount in satoshis */
  amount: bigint;
  /** Depositor's BTC public key (x-only, 64 hex chars) */
  depositorBtcPubkey: string | undefined;
  /** Depositor's BTC address for change output */
  btcAddress: string;
  /** Available UTXOs for funding */
  confirmedUTXOs: MempoolUTXO[] | undefined;
  /** Fee rate in sat/vB */
  feeRate: number;
  /** Vault provider's BTC public key (x-only, 64 hex chars) */
  vaultProviderBtcPubkey: string;
  /** Liquidator BTC public keys (x-only, 64 hex chars each) */
  liquidatorBtcPubkeys: string[];
}

/**
 * Builds an unsigned pegin transaction for ETH gas estimation.
 *
 * @param params - Parameters for building the transaction
 * @returns The unsigned transaction hex, or null if not all required data is available
 */
function getQueryKey(params: UnsignedPeginTxParams | null) {
  if (!params) return ["unsignedPeginTx"];
  return [
    "unsignedPeginTx",
    params.amount.toString(),
    params.depositorBtcPubkey,
    params.btcAddress,
    params.confirmedUTXOs?.length,
    params.feeRate,
    params.vaultProviderBtcPubkey,
    params.liquidatorBtcPubkeys.join(","),
  ];
}

export function useUnsignedPeginTx(
  params: UnsignedPeginTxParams | null,
): string | null {
  const { data: unsignedTxHex } = useQuery({
    queryKey: getQueryKey(params),
    queryFn: async () => {
      // Need all required data to build transaction
      if (
        !params ||
        !params.depositorBtcPubkey ||
        !params.btcAddress ||
        !params.confirmedUTXOs ||
        params.confirmedUTXOs.length === 0 ||
        params.feeRate === 0 ||
        params.amount === 0n ||
        !params.vaultProviderBtcPubkey
      ) {
        return null;
      }

      const {
        amount,
        btcAddress,
        confirmedUTXOs,
        feeRate,
        vaultProviderBtcPubkey,
        liquidatorBtcPubkeys,
      } = params;
      const depositorBtcPubkey = params.depositorBtcPubkey;

      const btcNetwork = getBTCNetworkForWASM();

      // Step 1: Build unfunded PSBT
      const peginPsbt = await buildPeginPsbt({
        depositorPubkey: depositorBtcPubkey,
        claimerPubkey: vaultProviderBtcPubkey.replace(/^0x/, ""),
        challengerPubkeys: liquidatorBtcPubkeys.map((pk) =>
          pk.replace(/^0x/, ""),
        ),
        pegInAmount: amount,
        network: btcNetwork,
      });

      // Step 2: Select UTXOs
      const utxoSelection = selectUtxosForPegin(
        confirmedUTXOs,
        amount,
        feeRate,
      );

      // Step 3: Fund the transaction
      const network = getNetwork(btcNetwork);
      const fundedTxHex = fundPeginTransaction({
        unfundedTxHex: peginPsbt.psbtHex,
        selectedUTXOs: utxoSelection.selectedUTXOs,
        changeAddress: btcAddress,
        changeAmount: utxoSelection.changeAmount,
        network,
      });

      return fundedTxHex;
    },
    enabled:
      !!params &&
      !!params.depositorBtcPubkey &&
      !!params.btcAddress &&
      !!params.confirmedUTXOs &&
      params.confirmedUTXOs.length > 0 &&
      params.feeRate > 0 &&
      params.amount > 0n &&
      !!params.vaultProviderBtcPubkey,
    staleTime: 30_000, // Cache for 30 seconds
    retry: false,
  });

  return unsignedTxHex ?? null;
}
