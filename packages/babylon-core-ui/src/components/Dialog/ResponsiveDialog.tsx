import { Dialog, DialogProps, MobileDialog } from "@/components/Dialog";
import { useIsMobile } from "@/hooks/useIsMobile";
import { WINDOW_BREAKPOINT } from "../../utils/constants";
import { twMerge } from "tailwind-merge";

export function ResponsiveDialog({ className, ...restProps }: DialogProps) {
  const isMobileView = useIsMobile(WINDOW_BREAKPOINT);
  const DialogComponent = isMobileView ? MobileDialog : Dialog;

  return <DialogComponent {...restProps} className={twMerge("w-[41.25rem] max-w-full", className)} />;
}

