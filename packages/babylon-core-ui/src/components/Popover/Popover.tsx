import { type PropsWithChildren, type CSSProperties, useEffect, useState, useRef } from "react";
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
  scrollContainerSelector?: string;
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
  scrollContainerSelector = ".bbn-table-wrapper",
}: PopoverProps) {
  const [tooltipRef, setTooltipRef] = useState<HTMLElement | null>(null);
  const { styles } = usePopper(anchorEl, tooltipRef, {
    placement,
    modifiers: [{ name: "offset", options: { offset } }],
  });

  useClickOutside([tooltipRef, anchorEl], onClickOutside, { enabled: open });

  // Use ref to maintain stable reference to onClickOutside
  const onClickOutsideRef = useRef(onClickOutside);
  onClickOutsideRef.current = onClickOutside;

  useEffect(() => {
    if (!open || !closeOnScroll) return;

    const handleScroll = () => {
      onClickOutsideRef.current?.();
    };

    // Add window scroll listener
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Add container scroll listener if selector is provided and element exists
    let scrollContainer: HTMLElement | null = null;
    if (scrollContainerSelector && anchorEl) {
      const container = anchorEl.closest(scrollContainerSelector);
      if (container instanceof HTMLElement) {
        scrollContainer = container;
        scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
      }
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", handleScroll);
      }
    };
  }, [open, closeOnScroll, anchorEl, scrollContainerSelector]);

  return (
    <Portal mounted={open}>
      <div ref={setTooltipRef} style={{ ...styles.popper, ...style }} className={twJoin("bbn-popover", className)}>
        {children}
      </div>
    </Portal>
  );
}
