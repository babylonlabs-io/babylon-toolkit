import {
  Button,
  CopyIcon,
  FullScreenDialog,
  Heading,
  Text,
} from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";
import { IoChevronBack } from "react-icons/io5";

import { DesktopOnlyIcon } from "@/components/shared/icons";
import { COPY } from "@/copy";

interface ContinueOnDesktopDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ContinueOnDesktopDialog({
  open,
  onClose,
}: ContinueOnDesktopDialogProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const copy = COPY.wallet.desktopOnly;
  const link = window.location.origin;

  useEffect(() => {
    if (!open) setCopyStatus("idle");
  }, [open]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      closeButtonClassName="!hidden"
      data-testid="continue-on-desktop-dialog"
    >
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={COPY.common.back}
          data-testid="continue-on-desktop-back"
          className="flex size-8 items-center justify-center text-accent-secondary"
        >
          <IoChevronBack size={24} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-between px-6 pb-4 pt-40">
        <div className="flex w-full flex-col items-center gap-8">
          <DesktopOnlyIcon />
          <div className="flex w-full flex-col gap-2 text-center">
            <Heading variant="h5" className="text-accent-primary">
              {copy.title}
            </Heading>
            <Text variant="body1" className="text-accent-secondary">
              {copy.body}
            </Text>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Button
            variant="contained"
            color="secondary"
            size="medium"
            className="flex h-10 w-full items-center justify-center gap-3 rounded-lg tracking-[0.17px]"
            onClick={copyLink}
            data-testid="continue-on-desktop-copy-link"
          >
            <span className="flex size-4 items-center justify-center">
              <CopyIcon size={14} color="text-inherit" />
            </span>
            {copyStatus === "copied" ? copy.linkCopied : copy.copyLink}
          </Button>
          <Button
            variant="outlined"
            size="medium"
            className="h-10 w-full rounded-lg tracking-[0.17px]"
            onClick={onClose}
            data-testid="continue-on-desktop-go-back"
          >
            {copy.goBack}
          </Button>
          {copyStatus === "failed" && (
            <Text
              variant="body2"
              className="select-all break-all text-center text-accent-secondary"
              data-testid="continue-on-desktop-link"
            >
              {link}
            </Text>
          )}
        </div>
      </div>
    </FullScreenDialog>
  );
}
