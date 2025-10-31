import { useCallback, useMemo, useState, type PropsWithChildren } from "react";

import { createStateUtils } from "../../../../utils/createStateUtils";

export enum VaultRedeemStep {
  IDLE = "idle",
  FORM = "form",
  REVIEW = "review",
  SIGN = "sign",
  SUCCESS = "success",
}

interface VaultRedeemState {
  step: VaultRedeemStep | undefined;
  processing: boolean;
  redeemDepositIds: string[];
  btcTxid: string;
  ethTxHash: string;
  goToStep: (step: VaultRedeemStep) => void;
  setRedeemData: (depositIds: string[]) => void;
  setTransactionHashes: (btcTxid: string, ethTxHash: string) => void;
  reset: () => void;
}

const { StateProvider, useState: useVaultRedeemState } =
  createStateUtils<VaultRedeemState>({
    step: undefined,
    processing: false,
    redeemDepositIds: [],
    btcTxid: "",
    ethTxHash: "",
    goToStep: () => {},
    setRedeemData: () => {},
    setTransactionHashes: () => {},
    reset: () => {},
  });

export function VaultRedeemState({ children }: PropsWithChildren) {
  const [step, setStep] = useState<VaultRedeemStep>();
  const [redeemDepositIds, setRedeemDepositIds] = useState<string[]>([]);
  const [btcTxid, setBtcTxid] = useState("");
  const [ethTxHash, setEthTxHash] = useState("");
  const [processing, setProcessing] = useState(false);

  const goToStep = useCallback((newStep: VaultRedeemStep) => {
    setStep(newStep);
  }, []);

  const setRedeemData = useCallback((depositIds: string[]) => {
    setRedeemDepositIds(depositIds);
  }, []);

  const setTransactionHashes = useCallback((btc: string, eth: string) => {
    setBtcTxid(btc);
    setEthTxHash(eth);
  }, []);

  const reset = useCallback(() => {
    setStep(undefined);
    setRedeemDepositIds([]);
    setBtcTxid("");
    setEthTxHash("");
    setProcessing(false);
  }, []);

  const context = useMemo(
    () => ({
      step,
      processing,
      redeemDepositIds,
      btcTxid,
      ethTxHash,
      goToStep,
      setRedeemData,
      setTransactionHashes,
      reset,
    }),
    [
      step,
      processing,
      redeemDepositIds,
      btcTxid,
      ethTxHash,
      goToStep,
      setRedeemData,
      setTransactionHashes,
      reset,
    ],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { useVaultRedeemState };
