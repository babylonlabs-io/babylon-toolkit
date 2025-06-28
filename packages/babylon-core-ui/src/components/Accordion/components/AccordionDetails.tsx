import { type PropsWithChildren, useContext, useEffect, useState } from "react";
import { twJoin } from "tailwind-merge";

import { Context } from "../Accordion";
import { useHeightObserver } from "../hooks/useHeightObserver";

interface AccordionDetailsProps {
  className?: string;
  wrapperClassName?: string;
  unmountOnExit?: boolean;
  animationDuration?: number;
}

export function AccordionDetails({
  unmountOnExit = false,
  animationDuration = 200,
  className,
  wrapperClassName,
  children,
}: PropsWithChildren<AccordionDetailsProps>) {
  const { expanded } = useContext(Context);
  const [visible, setVisibility] = useState(expanded);
  const mounted = visible || !unmountOnExit;
  const { height, ref: contentRef } = useHeightObserver<HTMLDivElement>(mounted);

  useEffect(
    function changeContentVisibility() {
      if (expanded === visible) {
        return;
      }

      if (expanded) {
        setVisibility(true);
        return;
      }

      const timer = setTimeout(setVisibility, animationDuration, false);

      return () => {
        clearTimeout(timer);
      };
    },
    [expanded, visible, animationDuration],
  );

  return (
    <div
      className={twJoin("bbn-accordion-details", wrapperClassName)}
      style={{
        height: expanded ? height : "0px",
        visibility: visible ? "visible" : "hidden",
        transitionDuration: `${animationDuration}ms`,
      }}
    >
      {mounted ? (
        <div ref={contentRef} className={twJoin("bbn-accordion-content", className)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
