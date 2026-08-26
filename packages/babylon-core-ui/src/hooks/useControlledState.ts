import { useState, useRef, useCallback } from "react";

interface Options<V> {
  value?: V;
  defaultValue?: V;
  onStateChange?: (state: V) => void;
}

export function useControlledState<V>({
  value: controlledState,
  defaultValue: defaultState,
  onStateChange,
}: Options<V> = {}): [V | undefined, (state: V) => void] {
  const [uncontrolledState, setUncontrolledState] = useState(defaultState);
  const { current: isControlled } = useRef(controlledState != null);

  const state = isControlled ? controlledState : uncontrolledState;

  const handleStateChange = useCallback(
    (newValue: V) => {
      if (!isControlled) {
        setUncontrolledState(newValue);
      }

      onStateChange?.(newValue);
    },
    [isControlled, onStateChange, setUncontrolledState],
  );

  return [state, handleStateChange];
}
