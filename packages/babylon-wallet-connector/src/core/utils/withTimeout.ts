/**
 * Reject a promise that does not settle within `ms`.
 *
 * Wallet-extension RPC calls (`window.unisat.getVersion()`, `getChain()`, …)
 * can hang indefinitely when the extension is locked, its MV3 service worker is
 * asleep, or it is still injecting. A hang is not a rejection, so without this
 * the caller's promise never settles and the UI is stuck on a loader forever.
 * `withTimeout` converts that hang into a rejection the caller can surface as an
 * actionable, recoverable error.
 *
 * The timer is always cleared, including on the happy path, so a settled
 * promise leaves no dangling timeout.
 *
 * @param promise   the underlying wallet call
 * @param ms        timeout budget in milliseconds
 * @param onTimeout produces the rejection error when the budget is exceeded
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
