import { PropsWithChildren, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCoreUI } from "../../providers/CoreUIProvider";

interface PortalProps {
  mounted?: boolean;
  rootClassName?: string;
  /** Whether to inherit viewport dimensions and positioning */
  inheritViewport?: boolean;
  /** Pointer events behavior for the portal */
  pointerEvents?: 'auto' | 'none';
}

export function Portal({ 
  children, 
  mounted = false, 
  rootClassName = "portal-root",
  inheritViewport = true,
  pointerEvents = 'auto'
}: PropsWithChildren<PortalProps>) {
  const [rootRef, setRootRef] = useState<HTMLElement | null>(null);
  const { portalContainer } = useCoreUI();

  const shouldDisablePointerEvents = pointerEvents === 'none';

  useEffect(() => {
    if (!mounted) {
      setRootRef(null);
      return;
    }

    const root = document.createElement("div");
    root.className = rootClassName;
    
    if (inheritViewport) {
      if (!rootClassName.includes('popover')) {
        // Intentionally no z-index: a stacking context here traps third-party
        // overlays (e.g. Reown AppKit's w3m-modal) underneath. The dialog and
        // backdrop children manage their own stacking via position: fixed.
        const styles = {
          position: "fixed" as const,
          top: "0",
          left: "0",
          width: "100vw",
          height: "100vh",
          pointerEvents: shouldDisablePointerEvents ? "none" as const : "auto" as const
        };
        Object.assign(root.style, styles);
      } else {
        // For popovers, just set z-index and pointer events
        root.style.zIndex = "9999";
        root.style.pointerEvents = shouldDisablePointerEvents ? "none" : "auto";
      }
    }
    
    const container = portalContainer || document.body;
    container.appendChild(root);
    setRootRef(root);

    return () => {
      if (container.contains(root)) {
        container.removeChild(root);
      }
    };
  }, [mounted, rootClassName, inheritViewport, shouldDisablePointerEvents, portalContainer]);

  return rootRef ? createPortal(children, rootRef) : null;
}