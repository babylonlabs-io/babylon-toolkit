import { RefObject, useEffect, useState } from "react";
import throttle from "lodash.throttle";

interface UseTableScrollOptions {
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
}

export function useTableScroll(
  tableRef: RefObject<HTMLDivElement>,
  { onLoadMore, hasMore = false, loading = false }: UseTableScrollOptions = {},
) {
  const [isScrolledTop, setIsScrolledTop] = useState(false);

  useEffect(() => {
    const handleScroll = throttle((e: Event) => {
      const target = e.target as HTMLDivElement;
      setIsScrolledTop(target.scrollTop > 0);

      if (!loading && hasMore && target.scrollHeight - target.scrollTop <= target.clientHeight + 100) {
        onLoadMore?.();
      }
    }, 100);

    const tableWrapper = tableRef.current;
    if (tableWrapper) {
      tableWrapper.addEventListener("scroll", handleScroll);
      return () => tableWrapper.removeEventListener("scroll", handleScroll);
    }
  }, [loading, hasMore, onLoadMore, tableRef]);

  return {
    isScrolledTop,
  };
}
