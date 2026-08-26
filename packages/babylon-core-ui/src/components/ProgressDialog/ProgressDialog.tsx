import { twMerge } from "tailwind-merge";

import { Button } from "@/components/Button";
import { DialogBody } from "@/components/Dialog/components/DialogBody";
import { DialogFooter } from "@/components/Dialog/components/DialogFooter";
import { DialogHeader } from "@/components/Dialog/components/DialogHeader";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Stepper, type StepperItem } from "@/components/Stepper";

export interface ProgressDialogProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  steps: StepperItem[];
  currentStep: number;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  className?: string;
}

export function ProgressDialog({
  open,
  onClose,
  title,
  steps,
  currentStep,
  actionLabel,
  onAction,
  actionDisabled,
  className,
}: ProgressDialogProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose} className={className}>
      <DialogHeader
        title={title}
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className={twMerge("px-6 pb-6 pt-4")}>
        <Stepper steps={steps} currentStep={currentStep} />
      </DialogBody>

      {actionLabel && onAction && (
        <DialogFooter className="px-6 pb-6">
          <Button
            variant="contained"
            color="secondary"
            fluid
            disabled={actionDisabled}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      )}
    </ResponsiveDialog>
  );
}
