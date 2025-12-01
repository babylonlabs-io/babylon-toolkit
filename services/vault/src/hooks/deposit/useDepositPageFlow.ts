/**
 * Deposit page flow hook
 *
 * Encapsulates all the deposit flow logic for the /deposit page,
 * including wallet state, provider data, and modal flow management.
 */

import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";
import type { Address } from "viem";

import {
  DepositStep,
  useDepositState,
} from "../../context/deposit/DepositState";
import { useETHWallet } from "../../context/wallet";
import type { Liquidator, VaultProvider } from "../../types/vaultProvider";
import { useVaultDeposits } from "../useVaultDeposits";

import { useVaultProviders } from "./useVaultProviders";

export interface UseDepositPageFlowResult {
  // Deposit state
  depositStep: DepositStep | undefined;
  depositAmount: bigint;
  selectedApplication: string;
  selectedProviders: string[];

  // Wallet data
  btcWalletProvider: unknown;
  ethAddress: Address | undefined;

  // Provider data
  selectedProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];

  // Actions
  startDeposit: (
    amountSats: bigint,
    application: string,
    providers: string[],
  ) => void;
  confirmReview: () => void;
  onSignSuccess: (btcTxid: string, ethTxHash: string) => void;
  resetDeposit: () => void;
  refetchActivities: () => Promise<void>;
}

export function useDepositPageFlow(): UseDepositPageFlowResult {
  // Wallet providers
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider || null;
  const { address: ethAddressRaw } = useETHWallet();
  const ethAddress = ethAddressRaw as Address | undefined;

  // Deposit flow state from context
  const {
    step: depositStep,
    amount: depositAmount,
    selectedApplication,
    selectedProviders,
    goToStep,
    setDepositData,
    setTransactionHashes,
    reset: resetDeposit,
  } = useDepositState();

  // Fetch vault providers and liquidators based on selected application
  const { vaultProviders, liquidators } = useVaultProviders(
    selectedApplication || undefined,
  );

  // Get activities refetch function
  const { refetchActivities } = useVaultDeposits(ethAddress);

  // Get selected provider's BTC public key and liquidators
  const { selectedProviderBtcPubkey, liquidatorBtcPubkeys } = useMemo(() => {
    if (selectedProviders.length === 0 || vaultProviders.length === 0) {
      return {
        selectedProviderBtcPubkey: "",
        liquidatorBtcPubkeys: [],
      };
    }

    const selectedProvider = vaultProviders.find(
      (p: VaultProvider) =>
        p.id.toLowerCase() === selectedProviders[0].toLowerCase(),
    );

    return {
      selectedProviderBtcPubkey: selectedProvider?.btcPubKey || "",
      liquidatorBtcPubkeys: liquidators.map((liq: Liquidator) => liq.btcPubKey),
    };
  }, [selectedProviders, vaultProviders, liquidators]);

  // Actions
  const startDeposit = (
    amountSats: bigint,
    application: string,
    providers: string[],
  ) => {
    setDepositData(amountSats, application, providers);
    goToStep(DepositStep.REVIEW);
  };

  const confirmReview = () => {
    goToStep(DepositStep.SIGN);
  };

  const onSignSuccess = (btcTxid: string, ethTxHash: string) => {
    setTransactionHashes(btcTxid, ethTxHash);
    goToStep(DepositStep.SUCCESS);
  };

  return {
    depositStep,
    depositAmount,
    selectedApplication,
    selectedProviders,
    btcWalletProvider,
    ethAddress,
    selectedProviderBtcPubkey,
    liquidatorBtcPubkeys,
    startDeposit,
    confirmReview,
    onSignSuccess,
    resetDeposit,
    refetchActivities,
  };
}
