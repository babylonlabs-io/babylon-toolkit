import { Dialog, DialogProps } from "@/components/Dialog";
import { useIsMobile } from "@/hooks/useIsMobile";
import { twMerge } from "tailwind-merge";

export function ResponsiveDialog({ className, ...restProps }: DialogProps) {
  const isMobileView = useIsMobile();
  return <Dialog {...restProps} mobile={isMobileView} className={twMerge("w-[41.25rem] max-w-full", className)} />;
}
