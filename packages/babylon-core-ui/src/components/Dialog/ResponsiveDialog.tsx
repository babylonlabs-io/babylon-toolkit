import { Dialog, type DialogProps, MobileDialog } from "./";
import { useIsMobile } from "@/hooks";
import { twMerge } from "tailwind-merge";

/**
 * ResponsiveDialog - Automatically switches between Desktop and Mobile dialogs
 * based on viewport size.
 * 
 * @param props - All standard Dialog props are supported
 * @param breakpoint - Optional custom breakpoint (default: 640px for sm:)
 * 
 * @example
 * ```tsx
 * <ResponsiveDialog open={isOpen} onClose={handleClose}>
 *   <DialogHeader title="My Modal" />
 *   <DialogBody>Content here</DialogBody>
 * </ResponsiveDialog>
 * ```
 */
export function ResponsiveDialog({ 
  className, 
  breakpoint = 640,
  ...restProps 
}: DialogProps & { breakpoint?: number }) {
  const isMobile = useIsMobile(breakpoint);
  const DialogComponent = isMobile ? MobileDialog : Dialog;

  return (
    <DialogComponent
      {...restProps}
      className={twMerge("w-[41.25rem] max-w-full", className)}
    />
  );
}

