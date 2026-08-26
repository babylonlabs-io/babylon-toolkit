import { Loader } from "@babylonlabs-io/core-ui";
import { BiSolidBadgeCheck, BiErrorCircle } from "react-icons/bi";

import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";

import { SubmitModal } from "../SubmitModal";

import { ClaimResultsContent } from "./ClaimResultsContent";

interface ClaimStatusModalProps {
  open: boolean;
  onClose?: () => void;
  loading: boolean;
  status?: ClaimStatus;
  results?: ClaimResult[];
}

export interface ClaimResult {
  label: string;
  success: boolean;
  txHash?: string;
  errorMessage?: string;
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
  },
  [ClaimStatus.SUCCESS]: {
    icon: <BiSolidBadgeCheck className="text-5xl text-primary-light" />,
    title: `Successfully Claimed ${coinSymbol}`,
    submitButton: "Done",
  },
  [ClaimStatus.PARTIAL]: {
    icon: <BiSolidBadgeCheck className="text-5xl text-primary-light" />,
    title: "Claim Completed With Some Failures",
    submitButton: "Done",
  },
  [ClaimStatus.ERROR]: {
    icon: <BiErrorCircle className="text-5xl text-primary-light" />,
    title: "Claim Failed",
    submitButton: "Done",
  },
};

export const ClaimStatusModal = ({
  open,
  onClose,
  loading,
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
      cancelButton=""
    >
      {resolvedStatus !== ClaimStatus.PROCESSING && (
        <ClaimResultsContent results={results} />
      )}
    </SubmitModal>
  );
};
