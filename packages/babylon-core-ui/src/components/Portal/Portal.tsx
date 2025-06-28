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

    return () => {
      document.body.removeChild(root);
    };
  }, [mounted]);

  return rootRef ? createPortal(children, rootRef) : null;
}
