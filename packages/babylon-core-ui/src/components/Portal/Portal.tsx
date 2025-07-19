import { PropsWithChildren, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
  mounted?: boolean;
  rootClassName?: string;
}

export function Portal({ children, mounted = false, rootClassName = "portal-root" }: PropsWithChildren<PortalProps>) {
  const [rootRef, setRootRef] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!mounted) {
      setRootRef(null);
      return;
    }

    const root = document.createElement("div");
    root.className = rootClassName;
    setRootRef(root);
    document.body.appendChild(root);

    // Sync dark/light classes or data-mode attribute from documentElement/body
    const syncThemeClass = () => {
      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark") ||
        document.documentElement.getAttribute("data-mode") === "dark" ||
        document.body.getAttribute("data-mode") === "dark";
      if (isDark) {
        root.classList.add("dark");
        root.setAttribute("data-mode", "dark");
      } else {
        root.classList.remove("dark");
        root.setAttribute("data-mode", "light");
      }
    };

    syncThemeClass();

    const observer = new MutationObserver(syncThemeClass);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-mode"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-mode"],
    });

    return () => {
      observer.disconnect();
      document.body.removeChild(root);
    };
  }, [mounted]);

  return rootRef ? createPortal(children, rootRef) : null;
}
