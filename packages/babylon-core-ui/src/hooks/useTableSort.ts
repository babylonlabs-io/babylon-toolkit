import { useCallback, useMemo, useState } from "react";
import { ColumnProps } from "../components/Table/types";

export function useTableSort<T>(data: T[], columns: ColumnProps<T>[]) {
  const [sortStates, setSortStates] = useState<{
    [key: string]: { direction: "asc" | "desc" | null; priority: number };
  }>({});

  const handleColumnSort = useCallback((columnKey: string, sorter?: (a: T, b: T) => number) => {
    if (!sorter) return;

    setSortStates((prev) => {
      const currentState = prev[columnKey]?.direction ?? null;
      const nextDirection: "asc" | "desc" | null =
        currentState === null ? "asc" : currentState === "asc" ? "desc" : null;

      if (nextDirection === null) {
        return Object.fromEntries(
          Object.entries(prev)
            .filter(([key]) => key !== columnKey)
            .map(([key, value]) => [
              key,
              { ...value, priority: value.priority > prev[columnKey].priority ? value.priority - 1 : value.priority },
            ]),
        );
      }

      const highestPriority = Math.max(0, ...Object.values(prev).map((s) => s.priority));
      return {
        ...prev,
        [columnKey]: { direction: nextDirection, priority: highestPriority + 1 },
      };
    });
  }, []);

  const sortedData = useMemo(() => {
    const activeSorters = Object.entries(sortStates)
      .filter(([, state]) => state.direction !== null)
      .toSorted((a, b) => b[1].priority - a[1].priority)
      .map(([key, state]) => ({
        column: columns.find((col) => col.key === key),
        direction: state.direction,
      }))
      .filter(({ column }) => column?.sorter);

    if (activeSorters.length === 0) return data;

    return data.toSorted((a, b) => {
      for (const { column, direction } of activeSorters) {
        const result = column!.sorter!(a, b);
        if (result !== 0) return direction === "asc" ? result : -result;
      }
      return 0;
    });
  }, [data, columns, sortStates]);

  return { sortStates, handleColumnSort, sortedData };
}
