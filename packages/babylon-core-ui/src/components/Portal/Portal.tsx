import { PropsWithChildren, useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
  mounted?: boolean;
  rootClassName?: string;
  /** Whether to sync theme classes from document to portal root */
  syncTheme?: boolean;
  /** Whether to inherit viewport dimensions and positioning */
  inheritViewport?: boolean;
}

export function Portal({ 
  children, 
  mounted = false, 
  rootClassName = "portal-root",
  syncTheme = true,
  inheritViewport = true
}: PropsWithChildren<PortalProps>) {
  const [rootRef, setRootRef] = useState<HTMLElement | null>(null);

  const shouldDisablePointerEvents = useMemo(() => {
    return rootClassName.includes('popover');
  }, [rootClassName]);

  // Memoize theme detection logic
  const detectDarkMode = useCallback((): boolean => {
    return document.documentElement.classList.contains("dark") ||
           document.body.classList.contains("dark") ||
           document.documentElement.getAttribute("data-mode") === "dark" ||
           document.body.getAttribute("data-mode") === "dark";
  }, []);

  // Optimized theme sync function
  const syncThemeClass = useCallback((root: HTMLElement) => {
    const isDark = detectDarkMode();
    
    if (isDark) {
      if (!root.classList.contains("dark")) {
        root.classList.add("dark");
        root.setAttribute("data-mode", "dark");
      }
    } else {
      if (root.classList.contains("dark")) {
        root.classList.remove("dark");
        root.setAttribute("data-mode", "light");
      }
    }
  }, [detectDarkMode]);

  useEffect(() => {
    if (!mounted) {
      setRootRef(null);
      return;
    }

    const root = document.createElement("div");
    root.className = rootClassName;
    
    // Apply viewport inheritance if enabled
    if (inheritViewport) {
      const styles = {
        position: "absolute" as const,
        top: "0",
        left: "0", 
        width: "100vw",
        height: "100vh",
        zIndex: "9999",
        pointerEvents: shouldDisablePointerEvents ? "none" as const : "auto" as const
      };
      Object.assign(root.style, styles);
    }
    
    
    document.body.appendChild(root);
    setRootRef(root);

    // Setup theme syncing if enabled
    let observer: MutationObserver | null = null;
    
    if (syncTheme) {
      syncThemeClass(root);

      observer = new MutationObserver(() => syncThemeClass(root));
      
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-mode"],
      });
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-mode"],
      });
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
      if (document.body.contains(root)) {
        document.body.removeChild(root);
      }
    };
  }, [mounted, rootClassName, syncTheme, inheritViewport, shouldDisablePointerEvents, syncThemeClass]);

  return rootRef ? createPortal(children, rootRef) : null;
}