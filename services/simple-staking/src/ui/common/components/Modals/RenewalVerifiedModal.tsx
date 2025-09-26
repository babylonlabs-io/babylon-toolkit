import { BiSolidBadgeCheck } from "react-icons/bi";

import { getNetworkConfig } from "@/ui/common/config/network";

import { SubmitModal } from "./SubmitModal";

interface RenewalVerifiedModalProps {
  processing?: boolean;
  open: boolean;
  onSubmit?: () => void;
  onClose?: () => void;
}

const { bbn } = getNetworkConfig();

export const RenewalVerifiedModal = ({
  processing,
  open,
  onSubmit,
}: RenewalVerifiedModalProps) => (
  <SubmitModal
    processing={processing}
    open={open}
    icon={<BiSolidBadgeCheck className="text-5xl text-primary-light" />}
    title="Verified"
    submitButton="Renew Staking Term"
    onSubmit={onSubmit}
  >
    Your request has been verified by {bbn.networkFullName}. You can now renew
    your Staking Term!
  </SubmitModal>
);
