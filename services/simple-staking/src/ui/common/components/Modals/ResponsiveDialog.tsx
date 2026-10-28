import { Dialog, DialogProps } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

import { useIsMobileView } from "@/ui/common/hooks/useBreakpoint";

export function ResponsiveDialog(props: DialogProps) {
  const isMobileView = useIsMobileView();

  return (
    <Dialog
      {...props}
      mobile={isMobileView}
      className={twMerge("w-[41.25rem] max-w-full", props.className)}
    />
  );
}
