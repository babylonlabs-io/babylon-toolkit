import { Loader, Text } from "@babylonlabs-io/core-ui";
import { BiSolidBadgeCheck, BiErrorCircle } from "react-icons/bi";

import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";

import { SubmitModal } from "../SubmitModal";

import { SuccessContent } from "./SuccessContent";

interface ClaimStatusModalProps {
  open: boolean;
  onClose?: () => void;
  loading: boolean;
  transactionHash: string[];
  status?: ClaimStatus;
  results?: { label: string; success: boolean; txHash?: string }[];
}

export enum ClaimStatus {
  PROCESSING = "processing",
  SUCCESS = "success",
  PARTIAL = "partial",
  ERROR = "error",
}

const { coinSymbol } = getNetworkConfigBBN();

const MODAL_STEP = {
  [ClaimStatus.PROCESSING]: {
    icon: <Loader size={48} className="text-primary-light" />,
    title: "Processing Claim",
    submitButton: "",
    cancelButton: "",
    content: null as any,
  },
  [ClaimStatus.SUCCESS]: {
    icon: <BiSolidBadgeCheck className="text-5xl text-primary-light" />,
    title: `Successfully Claimed ${coinSymbol}`,
    submitButton: "Done",
    cancelButton: "",
    content: (txHash: string[]) => <SuccessContent transactionHash={txHash} />,
  },
  [ClaimStatus.PARTIAL]: {
    icon: <BiSolidBadgeCheck className="text-5xl text-primary-light" />,
    title: "Claim Completed With Some Failures",
    submitButton: "Done",
    cancelButton: "",
    content: (
      _txHash: string[],
      results?: { label: string; success: boolean; txHash?: string }[],
    ) => (
      <div className="flex flex-col gap-3">
        {results?.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <Text variant="body1" className="text-accent-primary">
              {r.label}
            </Text>
            <div className="flex items-center gap-2">
              {r.success ? (
                <Text variant="body2" className="text-primary-light">
                  Success
                </Text>
              ) : (
                <Text variant="body2" className="text-status-error">
                  Failed
                </Text>
              )}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  [ClaimStatus.ERROR]: {
    icon: <BiErrorCircle className="text-status-error text-5xl" />,
    title: "Claim Failed",
    submitButton: "Done",
    cancelButton: "",
    content: (
      _txHash: string[],
      results?: { label: string; success: boolean }[],
    ) => (
      <div className="flex flex-col gap-3">
        {results?.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <Text variant="body1" className="text-accent-primary">
              {r.label}
            </Text>
            <Text variant="body2" className="text-status-error">
              Failed
            </Text>
          </div>
        ))}
      </div>
    ),
  },
};

export const ClaimStatusModal = ({
  open,
  onClose,
  loading,
  transactionHash,
  status,
  results,
}: ClaimStatusModalProps) => {
  const resolvedStatus = loading
    ? ClaimStatus.PROCESSING
    : (status ?? ClaimStatus.SUCCESS);
  const config = MODAL_STEP[resolvedStatus];

  return (
    <SubmitModal
      open={open}
      onClose={onClose}
      onSubmit={onClose}
      icon={config.icon}
      title={config.title}
      submitButton={config.submitButton}
      cancelButton={config.cancelButton}
    >
      {resolvedStatus === ClaimStatus.SUCCESS &&
        config.content?.(transactionHash)}
      {resolvedStatus !== ClaimStatus.SUCCESS &&
        resolvedStatus !== ClaimStatus.PROCESSING &&
        config.content?.(transactionHash, results)}
    </SubmitModal>
  );
};
