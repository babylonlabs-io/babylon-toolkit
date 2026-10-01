import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { useStagedHtlcSecret } from "../useStagedHtlcSecret";

const SECRET = "ab".repeat(32);

describe("useStagedHtlcSecret", () => {
  it("hands the staged secret over once, then throws", () => {
    const { result } = renderHook(() => useStagedHtlcSecret("vault-1"));

    act(() => result.current.stage(SECRET));
    expect(result.current.isStaged).toBe(true);

    let taken = "";
    act(() => {
      taken = result.current.take();
    });
    expect(taken).toBe(SECRET);
    expect(result.current.isStaged).toBe(false);
    expect(() => result.current.take()).toThrow(
      COPY.deposit.ledger.secretNotHeld,
    );
  });

  it("forgets the secret when the vault, address or wallet key changes", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => useStagedHtlcSecret(resetKey),
      { initialProps: { resetKey: "vault-1|tb1a|ledger_btc_vault" } },
    );
    act(() => result.current.stage(SECRET));

    rerender({ resetKey: "vault-1|tb1b|ledger_btc_vault" });

    expect(result.current.isStaged).toBe(false);
    expect(() => result.current.take()).toThrow(
      COPY.deposit.ledger.secretNotHeld,
    );
  });

  it("does not report a secret as staged after the key changes and changes back", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => useStagedHtlcSecret(resetKey),
      { initialProps: { resetKey: "vault-1|tb1a" } },
    );
    act(() => result.current.stage(SECRET));

    rerender({ resetKey: "vault-1|" });
    rerender({ resetKey: "vault-1|tb1a" });

    expect(result.current.isStaged).toBe(false);
  });

  it("forgets the secret on clear", () => {
    const { result } = renderHook(() => useStagedHtlcSecret("vault-1"));
    act(() => result.current.stage(SECRET));

    act(() => result.current.clear());

    expect(result.current.isStaged).toBe(false);
    expect(() => result.current.take()).toThrow(
      COPY.deposit.ledger.secretNotHeld,
    );
  });
});
