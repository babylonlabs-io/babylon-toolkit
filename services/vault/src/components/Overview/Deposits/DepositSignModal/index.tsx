import { getETHChain } from "@babylonlabs-io/config";
import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Step,
  Text,
} from "@babylonlabs-io/core-ui";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import { useUTXOs } from "@/hooks/useUTXOs";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { depositService } from "@/services/deposit";
import { createProofOfPossession } from "@/services/vault/vaultProofOfPossessionService";
import { submitPeginRequest } from "@/services/vault/vaultTransactionService";
import { addPendingPegin } from "@/storage/peginStorage";
import { processPublicKeyToXOnly } from "@/utils/btc";

interface BtcWalletProvider {
  signMessage: (
    message: string,
    type: "ecdsa" | "bip322-simple",
  ) => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
}

interface CollateralDepositSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey: string,
  ) => void;
  amount: bigint;
  btcWalletProvider: BtcWalletProvider;
  depositorEthAddress: Address | undefined;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  onRefetchActivities?: () => Promise<void>;
}

export function CollateralDepositSignModal({
  open,
  onClose,
  onSuccess,
  amount,
  btcWalletProvider,
  depositorEthAddress,
  selectedProviders,
  vaultProviderBtcPubkey,
  liquidatorBtcPubkeys,
  onRefetchActivities,
}: CollateralDepositSignModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevOpenRef = useRef(false);
  const hasExecutedRef = useRef(false);

  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;

  const {
    confirmedUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);

  const executeDepositFlow = useCallback(async () => {
    try {
      setProcessing(true);
      setError(null);

      if (!btcAddress) {
        throw new Error("BTC wallet not connected");
      }
      if (!depositorEthAddress) {
        throw new Error("ETH wallet not connected");
      }

      const amountValidation = depositService.validateDepositAmount(
        amount,
        10000n,
        21000000_00000000n,
      );
      if (!amountValidation.valid) {
        throw new Error(amountValidation.error);
      }

      if (selectedProviders.length === 0) {
        throw new Error("No providers selected");
      }

      if (isUTXOsLoading) {
        throw new Error("Loading UTXOs...");
      }
      if (utxoError) {
        throw new Error(`Failed to load UTXOs: ${utxoError}`);
      }
      if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
        throw new Error("No confirmed UTXOs available");
      }

      setCurrentStep(1);

      const btcPopSignatureRaw = await createProofOfPossession({
        ethAddress: depositorEthAddress,
        btcAddress,
        chainId: getETHChain().id,
        signMessage: (message: string) =>
          btcWalletProvider.signMessage(message, "ecdsa"),
      });

      setCurrentStep(2);

      const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
      const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

      const processedVaultProviderKey = vaultProviderBtcPubkey.startsWith("0x")
        ? vaultProviderBtcPubkey.slice(2)
        : vaultProviderBtcPubkey;

      const processedLiquidatorKeys = liquidatorBtcPubkeys.map((key) =>
        key.startsWith("0x") ? key.slice(2) : key,
      );

      const wagmiConfig = getSharedWagmiConfig();
      const expectedChainId = getETHChain().id;

      try {
        await switchChain(wagmiConfig, { chainId: expectedChainId });
      } catch (switchError) {
        console.error("Failed to switch chain:", switchError);
        throw new Error(
          `Please switch to ${expectedChainId === 1 ? "Ethereum Mainnet" : "Sepolia Testnet"} in your wallet`,
        );
      }

      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: expectedChainId,
        account: depositorEthAddress,
      });

      if (!walletClient) {
        throw new Error("Failed to get wallet client");
      }

      const fees = depositService.calculateDepositFees(amount);

      const result = await submitPeginRequest(
        walletClient,
        getETHChain(),
        depositorEthAddress,
        depositorBtcPubkey,
        amount,
        confirmedUTXOs,
        Number(fees.btcNetworkFee),
        btcAddress,
        selectedProviders[0] as Address,
        processedVaultProviderKey,
        processedLiquidatorKeys,
        btcPopSignatureRaw,
      );

      const btcTxid = "0x" + result.btcTxid;
      const ethTxHash = result.transactionHash;

      const pendingPeginData = {
        id: btcTxid,
        depositAmount: amount.toString(),
        btcAddress,
        ethAddress: depositorEthAddress,
        contractStatus: 0,
        localStatus: LocalStorageStatus.PENDING,
        ethTxHash,
        timestamp: Date.now(),
        vaultProviderBtcPubkey: processedVaultProviderKey,
        selectedProviders,
      };

      addPendingPegin(depositorEthAddress, pendingPeginData);

      setCurrentStep(3);

      if (onRefetchActivities) {
        await onRefetchActivities();
      }

      onSuccess(btcTxid, ethTxHash, depositorBtcPubkey);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Deposit flow error:", err);
    } finally {
      setProcessing(false);
    }
  }, [
    amount,
    btcWalletProvider,
    depositorEthAddress,
    selectedProviders,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
    onSuccess,
    btcAddress,
    confirmedUTXOs,
    isUTXOsLoading,
    utxoError,
    onRefetchActivities,
  ]);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    if (justOpened && !hasExecutedRef.current) {
      hasExecutedRef.current = true;
      executeDepositFlow();
    }

    if (!open && prevOpenRef.current) {
      hasExecutedRef.current = false;
    }

    prevOpenRef.current = open;
  }, [open, executeDepositFlow]);

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Deposit in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Please complete the required signing steps to begin your BTC deposit.
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Sign proof of possession
          </Step>
          <Step step={2} currentStep={currentStep}>
            Sign & submit peg-in request to Ethereum
          </Step>
          <Step step={3} currentStep={currentStep}>
            Sign Payout Transactions
          </Step>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-error/10 rounded-lg p-4">
            <Text variant="body2" className="text-error text-sm">
              Error: {error}
            </Text>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={processing && !error}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={error ? onClose : () => {}}
        >
          {processing && !error ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            "Close"
          ) : (
            "View Position"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
