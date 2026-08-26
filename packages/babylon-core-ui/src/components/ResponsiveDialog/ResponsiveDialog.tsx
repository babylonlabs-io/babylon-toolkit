import { twMerge } from "tailwind-merge";
import { Dialog, type DialogProps } from "../Dialog/Dialog";
import { MobileDialog } from "../Dialog/MobileDialog";
import { useIsMobile } from "../../hooks/useIsMobile";
import { WINDOW_BREAKPOINT } from "../../utils/constants";

export function ResponsiveDialog(props: DialogProps) {
  const isMobileView = useIsMobile(WINDOW_BREAKPOINT);
  const DialogComponent = isMobileView ? MobileDialog : Dialog;

  return (
    <DialogComponent
      {...props}
      className={twMerge("w-[41.25rem] max-w-full", props.className)}
    />
  );
}

