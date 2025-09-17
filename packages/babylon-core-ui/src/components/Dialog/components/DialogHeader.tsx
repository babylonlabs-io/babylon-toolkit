import type { DetailedHTMLProps, HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";

import { Heading } from "@/components/Heading";
import { IconButton } from "@/components/Button";

export interface DialogHeaderProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  title: string;
  onClose?: () => void;
}

export const DialogHeader = ({ className, children, title, onClose }: DialogHeaderProps) => (
  <div className={twJoin("bbn-dialog-header", className)} data-testid="dialog-header">
    <div className="bbn-dialog-title">
      <Heading variant="h5">{title}</Heading>

      {Boolean(onClose) && (
        <IconButton className="shrink-0" onClick={onClose} data-testid="dialog-close-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
              fill="currentColor"
            />
          </svg>
        </IconButton>
      )}
    </div>

    {children}
  </div>
);
