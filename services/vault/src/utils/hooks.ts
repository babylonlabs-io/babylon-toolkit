/**
 * React hook utilities
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Debounce hook - returns a debounced version of the callback
 *
 * @param callback - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced version of the callback
 *
 * @example
 * ```typescript
 * const debouncedSearch = useDebounce((query: string) => {
 *   console.log('Searching for:', query);
 * }, 500);
 *
 * // In component:
 * <input onChange={(e) => debouncedSearch(e.target.value)} />
 * ```
 */
export function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    ((...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    }) as T,
    [callback, delay],
  );
}

/**
 * Debounced-value hook — returns `value` only after it has stayed unchanged for
 * `delay` ms. Use it to throttle expensive work driven by a rapidly-changing
 * input (e.g. a gas estimate keyed off a slider amount), so a continuous drag
 * doesn't fire one RPC round-trip per tick.
 *
 * @param value - The value to debounce
 * @param delay - Quiet period in milliseconds before the new value is returned
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}
