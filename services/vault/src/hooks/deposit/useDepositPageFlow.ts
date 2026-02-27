/**
 * Deposit page flow hook
 *
 * Encapsulates all the deposit flow logic for the /deposit page,
 * including wallet state, provider data, and modal flow management.
 */

import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";
import type { Address } from "viem";

import { FeatureFlags } from "../../config";
import {
  DepositStep,
  useDepositState,
} from "../../context/deposit/DepositState";
import { useProtocolParamsContext } from "../../context/ProtocolParamsContext";
import { useETHWallet } from "../../context/wallet";
import type { VaultProvider } from "../../types/vaultProvider";
import { useVaultDeposits } from "../useVaultDeposits";
import { useVaults } from "../useVaults";

import { useVaultProviders } from "./useVaultProviders";

export interface UseDepositPageFlowResult {
  // Deposit state
  depositStep: DepositStep | undefined;
  depositAmount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  feeRate: number;

  // Wallet data
  btcWalletProvider: unknown;
  ethAddress: Address | undefined;

  // Provider data
  selectedProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];

  // Vault data
  hasExistingVaults: boolean;

  // Actions
  startDeposit: (
    amountSats: bigint,
    application: string,
    providers: string[],
  ) => void;
  confirmReview: (feeRate: number) => void;
  confirmMnemonic: () => void;
  onSignSuccess: (btcTxid: string, ethTxHash: string) => void;
  resetDeposit: () => void;
  refetchActivities: () => Promise<void>;

  // Primitives (for custom flows like SimpleDeposit)
  goToStep: (step: DepositStep) => void;
  setDepositData: (
    amount: bigint,
    application: string,
    providers: string[],
  ) => void;
  setFeeRate: (feeRate: number) => void;
  setTransactionHashes: (
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey?: string,
  ) => void;
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
    feeRate,
    goToStep,
    setDepositData,
    setFeeRate,
    setTransactionHashes,
    reset: resetDeposit,
  } = useDepositState();

  const { vaultProviders, vaultKeepers } = useVaultProviders(
    selectedApplication || undefined,
  );
  const { latestUniversalChallengers } = useProtocolParamsContext();

  // Get activities refetch function
  const { refetchActivities } = useVaultDeposits(ethAddress);

  const { data: existingVaults } = useVaults(ethAddress);
  const hasExistingVaults = (existingVaults?.length ?? 0) > 0;

  // Get selected provider's BTC public key, vault keepers, and universal challengers
  const {
    selectedProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  } = useMemo(() => {
    if (selectedProviders.length === 0 || vaultProviders.length === 0) {
      return {
        selectedProviderBtcPubkey: "",
        vaultKeeperBtcPubkeys: [],
        universalChallengerBtcPubkeys: [],
      };
    }

    const selectedProvider = vaultProviders.find(
      (p: VaultProvider) =>
        p.id.toLowerCase() === selectedProviders[0].toLowerCase(),
    );

    return {
      selectedProviderBtcPubkey: selectedProvider?.btcPubKey || "",
      vaultKeeperBtcPubkeys: vaultKeepers.map((vk) => vk.btcPubKey),
      universalChallengerBtcPubkeys: latestUniversalChallengers.map(
        (uc) => uc.btcPubKey,
      ),
    };
  }, [
    selectedProviders,
    vaultProviders,
    vaultKeepers,
    latestUniversalChallengers,
  ]);

  // Actions
  const startDeposit = (
    amountSats: bigint,
    application: string,
    providers: string[],
  ) => {
    setDepositData(amountSats, application, providers);
    goToStep(DepositStep.REVIEW);
  };

  const confirmReview = (confirmedFeeRate: number) => {
    setFeeRate(confirmedFeeRate);
    if (FeatureFlags.isDepositorAsClaimerEnabled) {
      goToStep(DepositStep.MNEMONIC);
    } else {
      goToStep(DepositStep.SIGN);
    }
  };

  const confirmMnemonic = () => {
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
    feeRate,
    btcWalletProvider,
    ethAddress,
    selectedProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    hasExistingVaults,
    startDeposit,
    confirmReview,
    confirmMnemonic,
    onSignSuccess,
    resetDeposit,
    refetchActivities,
    goToStep,
    setDepositData,
    setFeeRate,
    setTransactionHashes,
  };
}
