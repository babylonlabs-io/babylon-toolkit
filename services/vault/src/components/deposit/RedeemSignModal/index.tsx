import { getETHChain } from "@babylonlabs-io/config";
import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useState } from "react";
import type { Address, Hex, WalletClient } from "viem";
import { getWalletClient } from "wagmi/actions";

import { getApplicationByController } from "../../../applications";
import { redeemVaults } from "../../../services/vault/vaultTransactionService";
import type { VaultActivity } from "../../../types/activity";

interface RedeemCollateralSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (ethTxHash: string) => void;
  activities: VaultActivity[];
  depositIds: string[];
}

export function RedeemCollateralSignModal({
  open,
  onClose,
  onSuccess,
  activities,
  depositIds,
}: RedeemCollateralSignModalProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setProcessing(false);
      setError(null);
    }
  }, [open]);

  // Execute collateral redeem flow when modal opens
  useEffect(() => {
    if (open && !processing && !error) {
      executeRedeemFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const executeRedeemFlow = useCallback(async () => {
    setProcessing(true);
    setError(null);

    try {
      const ethChain = getETHChain();
      const ethWalletClient = await getWalletClient(getSharedWagmiConfig(), {
        chainId: ethChain.id,
      });

      if (!ethWalletClient) {
        throw new Error("Ethereum wallet not connected");
      }

      const selectedActivities = activities.filter((a) =>
        depositIds.includes(a.id),
      );
      const pegInTxHashes = selectedActivities
        .map((a) => (a.txHash || a.id) as Hex)
        .filter((hash): hash is Hex => !!hash);

      if (pegInTxHashes.length === 0) {
        throw new Error("No valid transaction hashes found for redemption");
      }

      // Validate all vaults belong to the same application controller
      const applicationControllers = selectedActivities
        .map((a) => a.applicationController?.toLowerCase())
        .filter((addr): addr is string => !!addr);

      if (applicationControllers.length !== selectedActivities.length) {
        throw new Error(
          "Some selected vaults are missing application controller information",
        );
      }

      if (applicationControllers.length === 0) {
        throw new Error("No application controller found for selected vaults");
      }

      const uniqueControllers = [...new Set(applicationControllers)];
      if (uniqueControllers.length > 1) {
        throw new Error(
          "Cannot redeem vaults from different applications in one transaction.",
        );
      }

      const applicationController = uniqueControllers[0] as Address;

      // Get application config from registry
      const app = getApplicationByController(applicationController);
      if (!app) {
        throw new Error(
          `Unknown application controller: ${applicationController}`,
        );
      }

      const { abi: contractABI, functionNames } = app.contracts;

      const results = await redeemVaults(
        ethWalletClient as WalletClient,
        ethChain,
        applicationController,
        pegInTxHashes,
        contractABI,
        functionNames.redeem,
      );

      setProcessing(false);

      // Get the first transaction hash for success callback
      const firstTxHash = results[0]?.transactionHash || "";

      onSuccess(firstTxHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setProcessing(false);
    }
  }, [activities, depositIds, onSuccess]);

  return (
    <ResponsiveDialog open={open} onClose={!processing ? onClose : undefined}>
      <DialogHeader
        title="Sign Transaction"
        onClose={!processing ? onClose : undefined}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col items-center gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        {!error && (
          <>
            <Text
              variant="body2"
              className="text-sm text-accent-secondary sm:text-base"
            >
              Please sign the transaction in your wallet
            </Text>
            <Loader size={48} className="text-accent-primary" />
          </>
        )}

        {error && (
          <div className="bg-error/10 w-full rounded-lg p-4">
            <Text variant="body2" className="text-error text-sm">
              {error}
            </Text>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={!error}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={error ? onClose : () => {}}
        >
          {error ? (
            "Close"
          ) : (
            <Loader size={16} className="text-accent-contrast" />
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
