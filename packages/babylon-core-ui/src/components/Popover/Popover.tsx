import { type PropsWithChildren, type CSSProperties, useEffect, useState } from "react";
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
  closeOnScroll?: boolean;
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
  closeOnScroll = true,
}: PopoverProps) {
  const [tooltipRef, setTooltipRef] = useState<HTMLElement | null>(null);
  const { styles } = usePopper(anchorEl, tooltipRef, {
    placement,
    modifiers: [{ name: "offset", options: { offset } }],
  });

  useClickOutside([tooltipRef, anchorEl], onClickOutside, { enabled: open });

  useEffect(() => {
    if (!open || !closeOnScroll) return;
    const handleScroll = () => {
      onClickOutside?.();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    const scrollContainer = anchorEl?.closest?.(".bbn-table-wrapper") as HTMLElement | null;
    scrollContainer?.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      scrollContainer?.removeEventListener("scroll", handleScroll);
    };
  }, [open, closeOnScroll, anchorEl, onClickOutside]);

  return (
    <Portal mounted={open}>
      <div ref={setTooltipRef} style={{ ...styles.popper, ...style }} className={twJoin("bbn-popover", className)}>
        {children}
      </div>
    </Portal>
  );
}
