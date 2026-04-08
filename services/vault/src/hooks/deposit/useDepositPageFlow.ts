/**
 * Deposit page flow hook
 *
 * Encapsulates all the deposit flow logic for the /deposit page,
 * including wallet state, provider data, and modal flow management.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Address } from "viem";

import type { AllocationPlan } from "@/services/vault";

import {
  DepositStep,
  useDepositState,
} from "../../context/deposit/DepositState";
import { useProtocolParamsContext } from "../../context/ProtocolParamsContext";
import { useETHWallet } from "../../context/wallet";
import { VaultStatus } from "../../types/vault";
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
  btcWalletProvider: BitcoinWallet | null;
  ethAddress: Address | undefined;

  // Provider data
  selectedProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];

  // Vault data
  hasExistingVaults: boolean;
  hasActiveVaults: boolean;

  // Actions
  startDeposit: (
    amountSats: bigint,
    application: string,
    providers: string[],
  ) => void;
  confirmReview: (feeRate: number) => void;
  confirmMnemonic: (mnemonic?: string, mnemonicId?: string) => void;
  getMnemonic: (() => Promise<string>) | undefined;
  mnemonicId: string | undefined;
  onSignSuccess: (peginTxHash: string, ethTxHash: string) => void;
  resetDeposit: () => void;
  refetchActivities: () => Promise<void>;

  // Split deposit state
  isSplitDeposit: boolean;
  setIsSplitDeposit: (v: boolean) => void;
  splitAllocationPlan: AllocationPlan | null;
  setSplitAllocationPlan: (plan: AllocationPlan | null) => void;

  // Primitives (for custom flows like SimpleDeposit)
  goToStep: (step: DepositStep) => void;
  setDepositData: (
    amount: bigint,
    application: string,
    providers: string[],
  ) => void;
  setFeeRate: (feeRate: number) => void;
  setTransactionHashes: (
    peginTxHash: string,
    ethTxHash: string,
    depositorBtcPubkey?: string,
  ) => void;
}

export function useDepositPageFlow(): UseDepositPageFlowResult {
  // Wallet providers
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;
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
    isSplitDeposit,
    setIsSplitDeposit,
    splitAllocationPlan,
    setSplitAllocationPlan,
    reset: resetDepositState,
  } = useDepositState();

  const { vaultProviders, vaultKeepers } = useVaultProviders(
    selectedApplication || undefined,
  );
  const { latestUniversalChallengers } = useProtocolParamsContext();

  // Get activities refetch function
  const { refetchActivities } = useVaultDeposits(ethAddress);

  const { data: existingVaults } = useVaults(ethAddress);
  const hasExistingVaults = (existingVaults?.length ?? 0) > 0;
  const hasActiveVaults = useMemo(
    () => existingVaults?.some((v) => v.status === VaultStatus.ACTIVE) ?? false,
    [existingVaults],
  );

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
    goToStep(DepositStep.MNEMONIC);
  };

  // Mnemonic is stored in a ref to avoid exposing the sensitive value in
  // React state / devtools.  A counter state forces re-renders when set/cleared.
  const mnemonicRef = useRef<string | undefined>(undefined);
  const [mnemonicId, setMnemonicId] = useState<string | undefined>(undefined);
  const [mnemonicVersion, setMnemonicVersion] = useState(0);

  const confirmMnemonic = useCallback((mnemonic?: string, id?: string) => {
    mnemonicRef.current = mnemonic;
    setMnemonicId(id);
    setMnemonicVersion((v) => v + 1);
  }, []);

  const getMnemonic = useMemo<(() => Promise<string>) | undefined>(
    () => (mnemonicRef.current ? async () => mnemonicRef.current! : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mnemonicVersion triggers rebuild
    [mnemonicVersion],
  );

  const resetDeposit = useCallback(() => {
    mnemonicRef.current = undefined;
    setMnemonicId(undefined);
    setMnemonicVersion((v) => v + 1);
    resetDepositState();
  }, [resetDepositState]);

  const onSignSuccess = (peginTxHash: string, ethTxHash: string) => {
    setTransactionHashes(peginTxHash, ethTxHash);
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
    hasActiveVaults,
    isSplitDeposit,
    setIsSplitDeposit,
    splitAllocationPlan,
    setSplitAllocationPlan,
    startDeposit,
    confirmReview,
    confirmMnemonic,
    getMnemonic,
    mnemonicId: mnemonicId,
    onSignSuccess,
    resetDeposit,
    refetchActivities,
    goToStep,
    setDepositData,
    setFeeRate,
    setTransactionHashes,
  };
}
