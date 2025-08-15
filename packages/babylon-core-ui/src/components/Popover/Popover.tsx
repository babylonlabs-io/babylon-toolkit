import { type PropsWithChildren, type CSSProperties, useState } from "react";
import { twJoin } from "tailwind-merge";
import { usePopper } from "react-popper";
import { type Placement } from "@popperjs/core";

import { Portal } from "@/components/Portal";
import { useClickOutside } from "@/hooks/useClickOutside";
import "./Popover.css";

export interface PopoverProps extends PropsWithChildren {
  open?: boolean;
  className?: string;
  placement?: Placement;
  anchorEl?: Element | null;
  offset?: [number, number];
  onClickOutside?: () => void;
  style?: CSSProperties;
}

export function Popover({
  open = false,
  className,
  anchorEl,
  placement = "bottom-start",
  offset = [0, 0],
  children,
  style,
  onClickOutside,
}: PopoverProps) {
  const [tooltipRef, setTooltipRef] = useState<HTMLElement | null>(null);
  const { styles } = usePopper(anchorEl, tooltipRef, {
    placement,
    modifiers: [{ name: "offset", options: { offset } }],
  });

  useClickOutside([tooltipRef, anchorEl], onClickOutside, { enabled: open });

  return (
    <Portal mounted={open} rootClassName="popover-portal">
      <div 
        ref={setTooltipRef} 
        style={{ ...styles.popper, ...style, pointerEvents: 'auto' }} 
        className={twJoin("bbn-popover", className)}
      >
        {children}
      </div>
    </Portal>
  );
}
