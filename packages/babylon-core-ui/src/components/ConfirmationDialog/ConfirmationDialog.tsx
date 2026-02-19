import { type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { Button } from "@/components/Button";
import { DialogBody } from "@/components/Dialog/components/DialogBody";
import { DialogFooter } from "@/components/Dialog/components/DialogFooter";
import { Heading } from "@/components/Heading";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Text } from "@/components/Text";

export interface ConfirmationDialogProps {
  open: boolean;
  onClose?: () => void;
  icon?: ReactNode;
  title: string;
  description: string;
  primaryAction: { label: string; onClick: () => void; disabled?: boolean };
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
}

export function ConfirmationDialog({
  open,
  onClose,
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: ConfirmationDialogProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose} className={className}>
      <DialogBody className="flex flex-col items-center gap-4 px-6 pb-4 pt-6">
        {icon && <div className="mb-2">{icon}</div>}
        <Heading variant="h5" className="text-center text-accent-primary">
          {title}
        </Heading>
        <Text
          variant="body1"
          className="text-center text-accent-secondary"
        >
          {description}
        </Text>
      </DialogBody>

      <DialogFooter
        className={twMerge(
          "flex flex-col gap-2 px-6 pb-6",
          !secondaryAction && "pt-2",
        )}
      >
        <Button
          variant="contained"
          color="secondary"
          fluid
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </Button>
        {secondaryAction && (
          <Button
            variant="ghost"
            color="primary"
            fluid
            onClick={secondaryAction.onClick}
          >
            {secondaryAction.label}
          </Button>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
}
