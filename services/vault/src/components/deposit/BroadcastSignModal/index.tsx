/**
 * BroadcastSignModal
 *
 * Modal for signing and broadcasting BTC transaction to Bitcoin network.
 * Opens when user clicks "Sign & Broadcast" button from deposits table.
 *
 * Shows provider steps during broadcast process.
 */

import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { usePeginPolling } from "../../../context/deposit/PeginPollingContext";
import { useVaultActions } from "../../../hooks/deposit/useVaultActions";
import { LocalStorageStatus } from "../../../models/peginStateMachine";
import { usePeginStorage } from "../../../storage/usePeginStorage";
import type { VaultActivity } from "../../../types/activity";

interface BroadcastSignModalProps {
  /** Modal open state */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** The deposit/activity to broadcast for */
  activity: VaultActivity;
  /** Depositor's ETH address */
  depositorEthAddress: string;
  /** Success callback - refetch activities and show success modal */
  onSuccess: () => void;
}

/**
 * Format address for display (first 6 and last 4 characters)
 */
function formatAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Provider step component
 */
function ProviderStep({
  step,
  providerAddress,
  isActive,
}: {
  step: number;
  providerAddress: string;
  isActive: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-medium ${
          isActive
            ? "bg-primary-main text-primary-contrast"
            : "bg-accent-secondary/20 text-accent-secondary"
        }`}
      >
        {isActive ? (
          <Loader size={16} className="text-primary-contrast" />
        ) : (
          step
        )}
      </div>
      <div className="flex-1 pt-1">
        <Text
          variant="body2"
          className={`text-sm ${isActive ? "font-medium text-accent-primary" : "text-accent-secondary"}`}
        >
          {formatAddress(providerAddress)} payout
        </Text>
      </div>
    </div>
  );
}

/**
 * Modal for broadcasting BTC transaction
 *
 * Shows provider steps and handles the broadcast process.
 */
export function BroadcastSignModal({
  open,
  onClose,
  activity,
  depositorEthAddress,
  onSuccess,
}: BroadcastSignModalProps) {
  const [localBroadcasting, setLocalBroadcasting] = useState(false);

  const { broadcasting, broadcastError, handleBroadcast } = useVaultActions();

  const { pendingPegins, updatePendingPeginStatus, addPendingPegin } =
    usePeginStorage({
      ethAddress: depositorEthAddress,
      confirmedPegins: [],
    });

  // Get optimistic update from polling context
  const { setOptimisticStatus } = usePeginPolling();

  const pendingPegin = pendingPegins.find((p) => p.id === activity.id);

  const handleSign = async () => {
    setLocalBroadcasting(true);

    try {
      await handleBroadcast({
        activityId: activity.id,
        activityAmount: activity.collateral.amount,
        activityProviders: activity.providers,
        activityApplicationController: activity.applicationController,
        connectedAddress: depositorEthAddress,
        pendingPegin,
        updatePendingPeginStatus,
        addPendingPegin,
        onRefetchActivities: () => {
          // Will be called after broadcast
        },
        onShowSuccessModal: () => {
          // Optimistically update UI immediately (before refetch completes)
          setOptimisticStatus(activity.id, LocalStorageStatus.CONFIRMING);
          setLocalBroadcasting(false);
          onSuccess();
        },
      });
    } catch {
      setLocalBroadcasting(false);
      // Error is already set in the hook
    }
  };

  const isBroadcasting = broadcasting || localBroadcasting;

  return (
    <ResponsiveDialog
      open={open}
      onClose={isBroadcasting ? undefined : onClose}
    >
      <DialogHeader
        title="Sign BTC Transaction"
        onClose={isBroadcasting ? undefined : onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-6 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Please sign the Bitcoin transaction to broadcast your deposit to the
          Bitcoin network.
        </Text>

        {/* Provider Steps */}
        <div className="flex flex-col gap-4">
          {activity.providers.map((provider, index) => (
            <ProviderStep
              key={provider.id}
              step={index + 1}
              providerAddress={provider.id}
              isActive={isBroadcasting && index === 0}
            />
          ))}
        </div>

        {/* Error Display */}
        {broadcastError && (
          <div className="bg-error/10 rounded-lg p-4">
            <Text variant="body2" className="text-error text-sm">
              Error: {broadcastError}
            </Text>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="flex gap-4 px-4 pb-6 sm:px-6">
        {!isBroadcasting && (
          <Button
            variant="outlined"
            color="primary"
            onClick={onClose}
            className="flex-1 text-xs sm:text-base"
          >
            Cancel
          </Button>
        )}

        <Button
          disabled={isBroadcasting}
          variant="contained"
          className="flex-1 text-xs sm:text-base"
          onClick={isBroadcasting ? undefined : handleSign}
        >
          {isBroadcasting ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : broadcastError ? (
            "Retry"
          ) : (
            "Sign & Broadcast"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
