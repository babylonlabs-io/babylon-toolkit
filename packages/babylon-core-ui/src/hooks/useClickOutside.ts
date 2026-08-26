import { useEffect } from "react";
import { useMemoizedArray } from "./useMemoizedArray";

type TargetElement<E> = E | null | undefined;

interface Options {
  enabled?: boolean;
}

export function useClickOutside<E extends Element>(
  targetElement: TargetElement<E> | TargetElement<E>[],
  handler: () => void = () => null,
  { enabled = true }: Options = {},
) {
  const targetElements = Array.isArray(targetElement) ? targetElement : [targetElement];
  const memoizedElements = useMemoizedArray(targetElements);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (enabled && memoizedElements.every((element) => !element?.contains(event.target as Node))) {
        handler();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [memoizedElements, enabled, handler]);
}
