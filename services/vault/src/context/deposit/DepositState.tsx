import { useCallback, useMemo, useState, type PropsWithChildren } from "react";

import { createStateUtils } from "../../utils/createStateUtils";

export enum DepositStep {
  FORM = "form",
  REVIEW = "review",
  SIGN = "sign",
  SUCCESS = "success",
}

export interface DepositStateData {
  step?: DepositStep;
  amount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  btcTxid: string;
  ethTxHash: string;
  depositorBtcPubkey?: string;
}

interface DepositStateContext {
  step?: DepositStep;
  amount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
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
    btcTxid: "",
    ethTxHash: "",
    depositorBtcPubkey: undefined,
    processing: false,
    goToStep: () => {},
    setDepositData: () => {},
    setTransactionHashes: () => {},
    setProcessing: () => {},
    reset: () => {},
  });

export function DepositState({ children }: PropsWithChildren) {
  const [step, setStep] = useState<DepositStep>();
  const [amount, setAmount] = useState<bigint>(0n);
  const [selectedApplication, setSelectedApplication] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
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
      btcTxid,
      ethTxHash,
      depositorBtcPubkey,
      processing,
      goToStep,
      setDepositData,
      setTransactionHashes,
      setProcessing,
      reset,
    }),
    [
      step,
      amount,
      selectedApplication,
      selectedProviders,
      btcTxid,
      ethTxHash,
      depositorBtcPubkey,
      processing,
      goToStep,
      setDepositData,
      setTransactionHashes,
      reset,
    ],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { useDepositState };
