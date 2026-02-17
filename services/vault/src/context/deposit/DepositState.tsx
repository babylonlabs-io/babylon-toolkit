import { useCallback, useMemo, useState, type PropsWithChildren } from "react";

import { createStateUtils } from "../../utils/createStateUtils";

export enum DepositStep {
  FORM = "form",
  SPLIT_CONFIRM = "split_confirm",
  REVIEW = "review",
  SIGN = "sign",
  SUCCESS = "success",
}

export interface DepositStateData {
  step?: DepositStep;
  amount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  feeRate: number;
  btcTxid: string;
  ethTxHash: string;
  depositorBtcPubkey?: string;
}

interface DepositStateContext {
  step?: DepositStep;
  amount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  feeRate: number;
  btcTxid: string;
  ethTxHash: string;
  depositorBtcPubkey?: string;
  processing: boolean;
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
  setProcessing: (processing: boolean) => void;
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
    goToStep: () => {},
    setDepositData: () => {},
    setFeeRate: () => {},
    setTransactionHashes: () => {},
    setProcessing: () => {},
    reset: () => {},
  });

export function DepositState({ children }: PropsWithChildren) {
  const [step, setStep] = useState<DepositStep>();
  const [amount, setAmount] = useState<bigint>(0n);
  const [selectedApplication, setSelectedApplication] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [feeRate, setFeeRate] = useState(0);
  const [btcTxid, setBtcTxid] = useState("");
  const [ethTxHash, setEthTxHash] = useState("");
  const [depositorBtcPubkey, setDepositorBtcPubkey] = useState<string>();
  const [processing, setProcessing] = useState(false);

  const goToStep = useCallback((newStep: DepositStep) => {
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
      goToStep,
      setDepositData,
      setFeeRate: updateFeeRate,
      setTransactionHashes,
      setProcessing,
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
