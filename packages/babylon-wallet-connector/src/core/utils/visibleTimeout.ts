/**
 * Run `callback` after `ms` of time while the page is visible.
 *
 * A phone suspends or throttles a backgrounded tab while the user approves in
 * the wallet app, so a wall-clock timer can expire before the user returns.
 * Hidden time does not count against the budget. Without `document`, this is a
 * plain `setTimeout`.
 *
 * @returns a cancel function that clears the timer and the listener
 */
export function setVisibleTimeout(callback: () => void, ms: number): () => void {
  if (typeof document === "undefined") {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  }

  let remainingMs = ms;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const start = () => {
    startedAt = Date.now();
    timer = setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      callback();
    }, remainingMs);
  };

  const pause = () => {
    clearTimeout(timer);
    timer = undefined;
    remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      if (timer !== undefined) pause();
    } else if (timer === undefined) {
      start();
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  if (document.visibilityState !== "hidden") start();

  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
