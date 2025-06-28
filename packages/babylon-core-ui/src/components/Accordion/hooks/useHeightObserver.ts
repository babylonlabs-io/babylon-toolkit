import { toPixels } from "@/utils/css";
import { useEffect, useRef, useState } from "react";

export function useHeightObserver<E extends HTMLElement>(enabled = true) {
  const [height, setHeight] = useState("0px");
  const [observer, setObserver] = useState<ResizeObserver>();

  const contentRef = useRef<E>(null);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;

      setHeight(toPixels(entry.target.clientHeight) ?? "0px");
    });

    setObserver(observer);
  }, []);

  useEffect(
    function updateAccordionHeightOnContentChange() {
      const { current: content } = contentRef;

      if (!enabled || !content) return;

      observer?.observe(content);

      return () => {
        observer?.unobserve(content);
      };
    },
    [enabled, observer],
  );

  return { height, ref: contentRef };
}
