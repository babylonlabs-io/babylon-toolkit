import { useCallback, useMemo, useState, type PropsWithChildren } from "react";
import type { Hex } from "viem";

import { createStateUtils } from "../../utils/createStateUtils";

export enum DepositStep {
  FORM = "form",
  REVIEW = "review",
  MNEMONIC = "mnemonic",
  SECRET = "secret",
  SIGN = "sign",
  SUCCESS = "success",
}

export interface DepositStateData {
  step?: DepositStep;
  amount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  feeRate: number;
  peginTxHash: string;
  ethTxHash: string;
  depositorBtcPubkey?: string;
  secretHashes: Hex[];
}

interface DepositStateContext {
  step?: DepositStep;
  amount: bigint;
  selectedApplication: string;
  selectedProviders: string[];
  feeRate: number;
  peginTxHash: string;
  ethTxHash: string;
  depositorBtcPubkey?: string;
  secretHashes: Hex[];
  processing: boolean;
  isSplitDeposit: boolean;
  splitVaultAmounts: bigint[] | null;
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
  setSecretHashes: (hashes: Hex[]) => void;
  setProcessing: (processing: boolean) => void;
  setIsSplitDeposit: (v: boolean) => void;
  setSplitVaultAmounts: (amounts: bigint[] | null) => void;
  reset: () => void;
}

const { StateProvider, useState: useDepositState } =
  createStateUtils<DepositStateContext>({
    step: undefined,
    amount: 0n,
    selectedApplication: "",
    selectedProviders: [],
    feeRate: 0,
    peginTxHash: "",
    ethTxHash: "",
    depositorBtcPubkey: undefined,
    secretHashes: [],
    processing: false,
    isSplitDeposit: false,
    splitVaultAmounts: null,
    goToStep: () => {},
    setDepositData: () => {},
    setFeeRate: () => {},
    setTransactionHashes: () => {},
    setSecretHashes: () => {},
    setProcessing: () => {},
    setIsSplitDeposit: () => {},
    setSplitVaultAmounts: () => {},
    reset: () => {},
  });

export function DepositState({ children }: PropsWithChildren) {
  const [step, setStep] = useState<DepositStep>();
  const [amount, setAmount] = useState<bigint>(0n);
  const [selectedApplication, setSelectedApplication] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [feeRate, setFeeRate] = useState(0);
  const [peginTxHash, setPeginTxHash] = useState("");
  const [ethTxHash, setEthTxHash] = useState("");
  const [depositorBtcPubkey, setDepositorBtcPubkey] = useState<string>();
  const [secretHashes, setSecretHashes] = useState<Hex[]>([]);
  const [processing, setProcessing] = useState(false);
  const [isSplitDeposit, setIsSplitDeposit] = useState(false);
  const [splitVaultAmounts, setSplitVaultAmounts] = useState<bigint[] | null>(
    null,
  );

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
      setPeginTxHash(btc);
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
    setPeginTxHash("");
    setEthTxHash("");
    setDepositorBtcPubkey(undefined);
    setSecretHashes([]);
    setProcessing(false);
    setIsSplitDeposit(false);
    setSplitVaultAmounts(null);
  }, []);

  const context = useMemo(
    () => ({
      step,
      amount,
      selectedApplication,
      selectedProviders,
      feeRate,
      peginTxHash,
      ethTxHash,
      depositorBtcPubkey,
      secretHashes,
      processing,
      isSplitDeposit,
      splitVaultAmounts,
      goToStep,
      setDepositData,
      setFeeRate: updateFeeRate,
      setTransactionHashes,
      setSecretHashes,
      setProcessing,
      setIsSplitDeposit,
      setSplitVaultAmounts,
      reset,
    }),
    [
      step,
      amount,
      selectedApplication,
      selectedProviders,
      feeRate,
      peginTxHash,
      ethTxHash,
      depositorBtcPubkey,
      secretHashes,
      processing,
      isSplitDeposit,
      splitVaultAmounts,
      goToStep,
      setDepositData,
      updateFeeRate,
      setTransactionHashes,
      setSecretHashes,
      reset,
    ],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { useDepositState };
