import { type PropsWithChildren, type ReactNode, useContext } from "react";
import { twJoin } from "tailwind-merge";

import { IconButton, IconButtonProps } from "@/components/Button";
import { Context } from "../Accordion";

interface AccordionSummaryProps {
  renderIcon?: (expanded: boolean) => ReactNode;
  className?: string;
  iconClassName?: string;
  iconProps?: IconButtonProps;
}

export function AccordionSummary({
  className,
  iconClassName,
  iconProps,
  children,
  renderIcon = () => null,
}: PropsWithChildren<AccordionSummaryProps>) {
  const { expanded, toggle } = useContext(Context);

  const icon = renderIcon(expanded);
  return (
    <div className={twJoin("bbn-accordion-summary", className)} onClick={toggle}>
      {children}
      {icon && <IconButton className={twJoin("bbn-accordion-icon", iconClassName)} {...iconProps}>{icon}</IconButton>}
    </div>
  );
}
