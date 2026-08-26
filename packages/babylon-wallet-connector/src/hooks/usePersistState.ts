"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

export function usePersistState<S>(key: string, storage: Storage, initialState: S): [S, Dispatch<SetStateAction<S>>] {
  function getDefaultState() {
    const defaultValue = typeof initialState === "function" ? (initialState as () => S)() : initialState;

    if (typeof storage === "undefined") {
      return defaultValue;
    }

    const persistValue = storage.getItem(key);
    const defaultState = persistValue ? (JSON.parse(persistValue) as S) : null;

    return (defaultState ?? defaultValue) as S;
  }

  const [state, setState] = useState<S>(getDefaultState);

  useEffect(
    function updateLocalStorage() {
      storage.setItem(key, JSON.stringify(state ?? ""));
    },
    [key, storage, state],
  );

  return [state, setState];
}
