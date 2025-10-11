import { Loader } from "@babylonlabs-io/core-ui";
import { BiSolidBadgeCheck, BiErrorCircle } from "react-icons/bi";

import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";

import { SubmitModal } from "../SubmitModal";

import { ClaimResultsContent } from "./ClaimResultsContent";
import { ClaimErrorsContent } from "./ClaimErrorsContent";

interface ClaimStatusModalProps {
  open: boolean;
  onClose?: () => void;
  loading: boolean;
  status?: ClaimStatus;
  results?: ClaimResult[];
}

export interface ClaimResult {
  kind: "btc" | "baby";
  label: string;
  success: boolean;
  txHash?: string;
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
    content: null,
  },
  [ClaimStatus.SUCCESS]: {
    icon: <BiSolidBadgeCheck className="text-5xl text-primary-light" />,
    title: `Successfully Claimed ${coinSymbol}`,
    submitButton: "Done",
    cancelButton: "",
    content: (results?: ClaimResult[]) => (
      <ClaimResultsContent results={results} />
    ),
  },
  [ClaimStatus.PARTIAL]: {
    icon: <BiSolidBadgeCheck className="text-5xl text-primary-light" />,
    title: "Claim Completed With Some Failures",
    submitButton: "Done",
    cancelButton: "",
    content: (results?: ClaimResult[]) => (
      <ClaimResultsContent results={results} />
    ),
  },
  [ClaimStatus.ERROR]: {
    icon: <BiErrorCircle className="text-5xl text-primary-light" />,
    title: "Claim Failed",
    submitButton: "Done",
    cancelButton: "",
    content: (results?: ClaimResult[]) => (
      <ClaimErrorsContent results={results} />
    ),
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
      cancelButton={config.cancelButton}
    >
      {resolvedStatus !== ClaimStatus.PROCESSING && config.content?.(results)}
    </SubmitModal>
  );
};
