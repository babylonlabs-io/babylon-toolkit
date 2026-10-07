import { Dialog, DialogProps, MobileDialog } from "@/components/Dialog";
import { useIsMobile } from "@/hooks/useIsMobile";
import { twMerge } from "tailwind-merge";

export function ResponsiveDialog({ className, ...restProps }: DialogProps) {
  const isMobileView = useIsMobile();
  const DialogComponent = isMobileView ? MobileDialog : Dialog;

  return <DialogComponent {...restProps} className={twMerge("w-[41.25rem] max-w-full", className)} />;
}

