import { useCallback, useMemo, useState, type PropsWithChildren } from "react";

import { createStateUtils } from "../utils/createStateUtils";

export enum VaultDepositStep {
  IDLE = "idle",
  FORM = "form",
  REVIEW = "review",
  SIGN = "sign",
  SUCCESS = "success",
}

interface VaultDepositState {
  step: VaultDepositStep | undefined;
  processing: boolean;
  depositAmount: bigint;
  selectedProviders: string[];
  btcTxid: string;
  ethTxHash: string;
  goToStep: (step: VaultDepositStep) => void;
  setDepositData: (amount: bigint, providers: string[]) => void;
  setTransactionHashes: (btcTxid: string, ethTxHash: string) => void;
  reset: () => void;
}

const { StateProvider, useState: useVaultDepositState } =
  createStateUtils<VaultDepositState>({
    step: undefined,
    processing: false,
    depositAmount: 0n,
    selectedProviders: [],
    btcTxid: "",
    ethTxHash: "",
    goToStep: () => {},
    setDepositData: () => {},
    setTransactionHashes: () => {},
    reset: () => {},
  });

export function VaultDepositState({ children }: PropsWithChildren) {
  const [step, setStep] = useState<VaultDepositStep>();
  const [depositAmount, setDepositAmount] = useState(0n);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [btcTxid, setBtcTxid] = useState("");
  const [ethTxHash, setEthTxHash] = useState("");
  const [processing, setProcessing] = useState(false);

  const goToStep = useCallback((newStep: VaultDepositStep) => {
    console.log("[VaultDepositState] Navigating to step:", newStep);
    setStep(newStep);
  }, []);

  const setDepositData = useCallback((amount: bigint, providers: string[]) => {
    console.log("[VaultDepositState] Setting deposit data:", {
      amount: amount.toString(),
      providers,
    });
    setDepositAmount(amount);
    setSelectedProviders(providers);
  }, []);

  const setTransactionHashes = useCallback((btc: string, eth: string) => {
    console.log("[VaultDepositState] Setting transaction hashes:", {
      btc,
      eth,
    });
    setBtcTxid(btc);
    setEthTxHash(eth);
  }, []);

  const reset = useCallback(() => {
    console.log("[VaultDepositState] Resetting state");
    setStep(undefined);
    setDepositAmount(0n);
    setSelectedProviders([]);
    setBtcTxid("");
    setEthTxHash("");
    setProcessing(false);
  }, []);

  const context = useMemo(
    () => ({
      step,
      processing,
      depositAmount,
      selectedProviders,
      btcTxid,
      ethTxHash,
      goToStep,
      setDepositData,
      setTransactionHashes,
      reset,
    }),
    [
      step,
      processing,
      depositAmount,
      selectedProviders,
      btcTxid,
      ethTxHash,
      goToStep,
      setDepositData,
      setTransactionHashes,
      reset,
    ],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { useVaultDepositState };
