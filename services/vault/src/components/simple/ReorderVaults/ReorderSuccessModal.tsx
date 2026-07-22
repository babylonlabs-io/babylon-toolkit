import { Button } from "@babylonlabs-io/core-ui";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { COPY } from "@/copy";

import { REORDER_SUCCESS_TEXT, REORDER_SUCCESS_TITLE } from "./constants";
import { ReorderSuccessIcon } from "./ReorderSuccessIcon";

interface ReorderSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReorderSuccessModal({
  isOpen,
  onClose,
}: ReorderSuccessModalProps) {
  return (
    <V3ModalShell
      open={isOpen}
      onClose={onClose}
      contentClassName="max-w-[564px]"
    >
      <div className="flex w-full flex-col items-center gap-10 rounded-2xl border border-secondary-strokeLight bg-primary-contrast px-6 pb-6 pt-10">
        <ReorderSuccessIcon className="text-accent-primary" />
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <h2 className="text-[34px] leading-[1.235] tracking-[0.25px] text-accent-primary">
            {REORDER_SUCCESS_TITLE}
          </h2>
          <p className="text-xl leading-[1.6] tracking-[0.15px] text-accent-secondary">
            {REORDER_SUCCESS_TEXT}
          </p>
        </div>
        <Button
          variant="contained"
          color="secondary"
          size="large"
          fluid
          onClick={onClose}
        >
          {COPY.reorder.doneButton}
        </Button>
      </div>
    </V3ModalShell>
  );
}
