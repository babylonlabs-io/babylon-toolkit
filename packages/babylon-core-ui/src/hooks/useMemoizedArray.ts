import { useRef } from "react";

function areArraysEqual<V>(arrA: V[], arrB: V[]) {
  if (arrA === arrB) {
    return true;
  }

  if (arrA.length !== arrB.length) {
    return false;
  }

  for (let i = 0; i < arrA.length; i++) {
    if (arrA[i] !== arrB[i]) {
      return false;
    }
  }

  return true;
}

export function useMemoizedArray<V>(array: V[]) {
  const ref = useRef(array);

  if (!areArraysEqual(ref.current, array)) {
    ref.current = array;
  }

  return ref.current;
}
