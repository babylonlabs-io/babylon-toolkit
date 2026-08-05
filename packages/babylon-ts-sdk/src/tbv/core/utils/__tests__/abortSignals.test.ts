/**
 * Guards the browser-compatibility fix for `combineAbortSignals`.
 *
 * The regression this protects against: the mempool client used to call
 * `AbortSignal.any`, which is absent on Safari < 17.4 and Chrome < 116. It
 * threw before `fetch` was reached, so UTXO fetches, fee estimation and
 * transaction broadcast all failed outright on those browsers. The last test
 * deletes `AbortSignal.any` outright to prove the helper never reaches for it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { combineAbortSignals } from "../abortSignals";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("combineAbortSignals", () => {
  it("aborts the composed signal when the first input aborts", () => {
    const first = new AbortController();
    const second = new AbortController();

    const { signal } = combineAbortSignals([first.signal, second.signal]);
    expect(signal.aborted).toBe(false);

    first.abort();

    expect(signal.aborted).toBe(true);
  });

  it("aborts the composed signal when the second input aborts", () => {
    const first = new AbortController();
    const second = new AbortController();

    const { signal } = combineAbortSignals([first.signal, second.signal]);
    second.abort();

    expect(signal.aborted).toBe(true);
  });

  it("propagates the abort reason of whichever input fired", () => {
    const first = new AbortController();
    const second = new AbortController();
    const reason = new DOMException("caller went away", "AbortError");

    const { signal } = combineAbortSignals([first.signal, second.signal]);
    second.abort(reason);

    expect(signal.reason).toBe(reason);
  });

  it("returns an already-aborted input directly", () => {
    const aborted = new AbortController();
    aborted.abort();
    const live = new AbortController();

    const { signal } = combineAbortSignals([aborted.signal, live.signal]);

    expect(signal).toBe(aborted.signal);
    expect(signal.aborted).toBe(true);
  });

  it("returns a lone input directly rather than wrapping it", () => {
    const only = new AbortController();

    const { signal } = combineAbortSignals([only.signal]);

    expect(signal).toBe(only.signal);
  });

  it("stops propagating aborts once cleanup has run", () => {
    const first = new AbortController();
    const second = new AbortController();

    const { signal, cleanup } = combineAbortSignals([
      first.signal,
      second.signal,
    ]);
    cleanup();
    first.abort();

    expect(signal.aborted).toBe(false);
  });

  it("works on a runtime with no AbortSignal.any", () => {
    const original = AbortSignal.any;
    // @ts-expect-error - deliberately emulating a browser that predates the API
    delete AbortSignal.any;

    try {
      const first = new AbortController();
      const second = new AbortController();

      const { signal } = combineAbortSignals([first.signal, second.signal]);
      second.abort();

      expect(signal.aborted).toBe(true);
    } finally {
      AbortSignal.any = original;
    }
  });
});
