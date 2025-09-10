import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { ActivityCard } from "@/ui/common/components/ActivityCard/ActivityCard";
import { transformDelegationToVerifiedExpansionCard } from "@/ui/common/components/ActivityCard/utils/activityCardTransformers";
import { ResponsiveDialog } from "@/ui/common/components/Modals/ResponsiveDialog";
import { useVerifiedStakingExpansionService } from "@/ui/common/hooks/services/useVerifiedStakingExpansionService";
import { useDelegationV2State } from "@/ui/common/state/DelegationV2State";
import { useFinalityProviderState } from "@/ui/common/state/FinalityProviderState";
import { DelegationV2 } from "@/ui/common/types/delegationsV2";

interface VerifiedStakeExpansionModalProps {
  open: boolean;
  onClose: () => void;
  processing?: boolean;
}

interface VerifiedExpansionItemProps {
  delegation: DelegationV2;
  onExpand: () => void;
  processing: boolean;
}

function VerifiedExpansionItem({
  delegation,
  onExpand,
  processing,
}: VerifiedExpansionItemProps) {
  const { findDelegationByTxHash } = useDelegationV2State();
  const { finalityProviderMap } = useFinalityProviderState();

  // Transform delegation to activity card data
  const activityCardData = useMemo(() => {
    // Find the original delegation - this should always exist for verified expansions
    const originalDelegation = delegation.previousStakingTxHashHex
      ? findDelegationByTxHash(delegation.previousStakingTxHashHex)
      : undefined;

    if (!originalDelegation) {
      console.error(
        "Original delegation not found for verified expansion:",
        delegation.stakingTxHashHex,
        "previousTxHash:",
        delegation.previousStakingTxHashHex,
      );
      // This should not happen for verified expansions, but return a fallback
      throw new Error(
        `Invalid verified expansion: original delegation not found for ${delegation.stakingTxHashHex}`,
      );
    }

    return transformDelegationToVerifiedExpansionCard(
      delegation,
      originalDelegation,
      finalityProviderMap,
    );
  }, [delegation, findDelegationByTxHash, finalityProviderMap]);

  // Create the activity card data with primary action
  const activityCardDataWithAction = {
    ...activityCardData,
    primaryAction: {
      label: "Expand",
      onClick: onExpand,
      variant: "contained" as const,
      size: "small" as const,
      disabled: processing,
    },
  };

  return (
    <ActivityCard
      data={activityCardDataWithAction}
      className="border border-secondary-strokeLight"
    />
  );
}

function VerifiedStakeExpansionModalInner({
  open,
  onClose,
  processing = false,
}: VerifiedStakeExpansionModalProps) {
  const { verifiedExpansions, resumeVerifiedExpansion } =
    useVerifiedStakingExpansionService();

  // Simple state for tracking expansion process
  const [isExpanding, setIsExpanding] = useState(false);

  const handleExpand = async (delegation: DelegationV2) => {
    setIsExpanding(true);
    try {
      await resumeVerifiedExpansion(delegation);
    } finally {
      setIsExpanding(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={() => !isExpanding && onClose()}>
      <DialogHeader
        title="Verified Stake Expansions"
        onClose={onClose}
        className="text-accent-primary"
      />
      <Text variant="body1" className="mb-4 text-accent-secondary">
        Your expansion requests have been verified by the Babylon network. You
        can now complete the expansion by signing and broadcasting to Bitcoin.
      </Text>
      <DialogBody className="no-scrollbar flex max-h-[70vh] flex-col gap-4 overflow-y-auto pb-4 text-accent-primary">
        <div className="flex flex-col gap-2">
          {verifiedExpansions.length === 0 ? (
            <div className="py-8 text-center">
              <Text variant="body1" className="text-accent-secondary">
                No verified expansions found.
              </Text>
            </div>
          ) : (
            <div className="space-y-3">
              {verifiedExpansions.map((delegation) => (
                <VerifiedExpansionItem
                  key={delegation.stakingTxHashHex}
                  delegation={delegation}
                  onExpand={() => handleExpand(delegation)}
                  processing={processing || isExpanding}
                />
              ))}
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter className="flex gap-4">
        <Button
          variant="contained"
          className="flex-1 text-xs sm:text-base"
          onClick={onClose}
          disabled={processing || isExpanding}
        >
          Close
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}

export function VerifiedStakeExpansionModal(
  props: VerifiedStakeExpansionModalProps,
) {
  return <VerifiedStakeExpansionModalInner {...props} />;
}
