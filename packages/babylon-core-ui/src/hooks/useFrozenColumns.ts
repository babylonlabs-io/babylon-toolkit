import { useEffect, useState, RefObject } from "react";

export function useFrozenColumns(containerRef: RefObject<HTMLDivElement>) {
  const [isLeftScrolled, setIsLeftScrolled] = useState(false);
  const [isRightScrolled, setIsRightScrolled] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      
      // Show left shadow when scrolled right (content is under left frozen column)
      setIsLeftScrolled(scrollLeft > 0);
      
      // Show right shadow when scrolled left from the rightmost position (content is under right frozen column)
      const maxScrollLeft = scrollWidth - clientWidth;
      setIsRightScrolled(maxScrollLeft > 0 && scrollLeft < maxScrollLeft);
    };

    // Initial check
    handleScroll();

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef]);

  return { isLeftScrolled, isRightScrolled };
}