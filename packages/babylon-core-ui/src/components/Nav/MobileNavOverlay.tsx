import { useEffect, useRef } from "react";

import { useModalManager } from "@/hooks/useModalManager";

export interface MobileNavOverlayProps {
  /** Viewport offset (px) of the header's bottom edge; the panel fills below it. */
  top: number;
  onClose: () => void;
  children?: React.ReactNode;
}

export const MobileNavOverlay = ({
  top,
  onClose,
  children,
}: MobileNavOverlayProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalManager({ open: true, onClose });

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const handleNavClick = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a")) {
      onClose();
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      tabIndex={-1}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-y-auto bg-surface p-4 focus:outline-none"
      style={{ top }}
    >
      <nav className="flex flex-1 flex-col gap-9" onClick={handleNavClick}>
        {children}
      </nav>
    </div>
  );
};
