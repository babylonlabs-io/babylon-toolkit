import { useCallback, useMemo, useState, type PropsWithChildren } from "react";

import type { AllocationPlan } from "@/services/vault";

import { createStateUtils } from "../../utils/createStateUtils";

export enum DepositPageStep {
  FORM = "form",
  REVIEW = "review",
  SIGN = "sign",
  SUCCESS = "success",
}

export interface DepositStateData {
  step?: DepositPageStep;
  amount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  feeRate: number;
  btcTxid: string;
  ethTxHash: string;
  depositorBtcPubkey?: string;
}

interface DepositStateContext {
  step?: DepositPageStep;
  amount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  feeRate: number;
  btcTxid: string;
  ethTxHash: string;
  depositorBtcPubkey?: string;
  processing: boolean;
  isSplitDeposit: boolean;
  splitAllocationPlan: AllocationPlan | null;
  goToStep: (step: DepositPageStep) => void;
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
  setProcessing: (processing: boolean) => void;
  setIsSplitDeposit: (isSplit: boolean) => void;
  setSplitAllocationPlan: (plan: AllocationPlan | null) => void;
  reset: () => void;
}

const { StateProvider, useState: useDepositState } =
  createStateUtils<DepositStateContext>({
    step: undefined,
    amount: 0n,
    selectedApplication: "",
    selectedProviders: [],
    feeRate: 0,
    btcTxid: "",
    ethTxHash: "",
    depositorBtcPubkey: undefined,
    processing: false,
    isSplitDeposit: false,
    splitAllocationPlan: null,
    goToStep: () => {},
    setDepositData: () => {},
    setFeeRate: () => {},
    setTransactionHashes: () => {},
    setProcessing: () => {},
    setIsSplitDeposit: () => {},
    setSplitAllocationPlan: () => {},
    reset: () => {},
  });

export function DepositState({ children }: PropsWithChildren) {
  const [step, setStep] = useState<DepositPageStep>();
  const [amount, setAmount] = useState<bigint>(0n);
  const [selectedApplication, setSelectedApplication] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [feeRate, setFeeRate] = useState(0);
  const [btcTxid, setBtcTxid] = useState("");
  const [ethTxHash, setEthTxHash] = useState("");
  const [depositorBtcPubkey, setDepositorBtcPubkey] = useState<string>();
  const [processing, setProcessing] = useState(false);
  const [isSplitDeposit, setIsSplitDeposit] = useState(false);
  const [splitAllocationPlan, setSplitAllocationPlan] =
    useState<AllocationPlan | null>(null);

  const goToStep = useCallback((newStep: DepositPageStep) => {
    setStep(newStep);
  }, []);

  const setDepositData = useCallback(
    (newAmount: bigint, application: string, providers: string[]) => {
      setAmount(newAmount);
      setSelectedApplication(application);
      setSelectedProviders(providers);
    },
    [],
  );

  const updateFeeRate = useCallback((newFeeRate: number) => {
    setFeeRate(newFeeRate);
  }, []);

  const setTransactionHashes = useCallback(
    (btc: string, eth: string, pubkey?: string) => {
      setBtcTxid(btc);
      setEthTxHash(eth);
      setDepositorBtcPubkey(pubkey);
    },
    [],
  );

  const reset = useCallback(() => {
    setStep(undefined);
    setAmount(0n);
    setSelectedApplication("");
    setSelectedProviders([]);
    setFeeRate(0);
    setBtcTxid("");
    setEthTxHash("");
    setDepositorBtcPubkey(undefined);
    setProcessing(false);
    setIsSplitDeposit(false);
    setSplitAllocationPlan(null);
  }, []);

  const context = useMemo(
    () => ({
      step,
      amount,
      selectedApplication,
      selectedProviders,
      feeRate,
      btcTxid,
      ethTxHash,
      depositorBtcPubkey,
      processing,
      isSplitDeposit,
      splitAllocationPlan,
      goToStep,
      setDepositData,
      setFeeRate: updateFeeRate,
      setTransactionHashes,
      setProcessing,
      setIsSplitDeposit,
      setSplitAllocationPlan,
      reset,
    }),
    [
      step,
      amount,
      selectedApplication,
      selectedProviders,
      feeRate,
      btcTxid,
      ethTxHash,
      depositorBtcPubkey,
      processing,
      isSplitDeposit,
      splitAllocationPlan,
      goToStep,
      setDepositData,
      updateFeeRate,
      setTransactionHashes,
      reset,
    ],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { useDepositState };
