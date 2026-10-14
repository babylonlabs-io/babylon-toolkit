/**
 * Pins when a "nonce too low" refusal counts as naming the refused
 * transaction's nonce. The stale-nonce retry sends a transaction again only on
 * this evidence, so every doubtful text must read as null.
 */

import { InternalRpcError, NonceTooLowError, RpcRequestError } from "viem";
import { describe, expect, it } from "vitest";

import { readRejectedNonce } from "../rejectedNonce";

describe("readRejectedNonce", () => {
  it("reads geth's refusal behind MetaMask's prefix", () => {
    const error = new InternalRpcError(
      Object.assign(
        new Error(
          "RPC 0xaa36a7 Infura eth_sendRawTransaction: nonce too low: next nonce 767, tx nonce 766",
        ),
        { code: InternalRpcError.code },
      ),
    );

    expect(readRejectedNonce(error)).toEqual({ nonce: 766, nextNonce: 767 });
  });

  it("reads the nonce when every frame viem wraps the node's text in names it", () => {
    const error = new NonceTooLowError({
      cause: new RpcRequestError({
        body: {},
        error: {
          code: -32000,
          message: "nonce too low: next nonce 788, tx nonce 787",
        },
        url: "https://rpc.example",
      }),
    });

    expect(readRejectedNonce(error)).toEqual({ nonce: 787, nextNonce: 788 });
  });

  it("reads the nonce from a bare string cause", () => {
    const error = new Error("send failed", {
      cause: "nonce too low: next nonce 5, tx nonce 4",
    });

    expect(readRejectedNonce(error)).toEqual({ nonce: 4, nextNonce: 5 });
  });

  it("returns null when the refusal names no nonce", () => {
    expect(readRejectedNonce(new Error("nonce too low"))).toBeNull();
  });

  it("returns null for geth's call-execution wording, which is about a call, not the sent transaction", () => {
    const error = new Error(
      "nonce too low: address 0xAbCdEf0000000000000000000000000000000002, tx: 787 state: 788",
    );

    expect(readRejectedNonce(error)).toBeNull();
  });

  it("returns null when frames name different nonces", () => {
    const error = new Error("nonce too low: next nonce 788, tx nonce 787", {
      cause: new Error("nonce too low: next nonce 789, tx nonce 788"),
    });

    expect(readRejectedNonce(error)).toBeNull();
  });

  it("returns null when the count named is not above the nonce", () => {
    const error = new Error("nonce too low: next nonce 787, tx nonce 787");

    expect(readRejectedNonce(error)).toBeNull();
  });

  it("returns null when a number is too large to read exactly", () => {
    const error = new Error(
      "nonce too low: next nonce 99999999999999999999, tx nonce 1",
    );

    expect(readRejectedNonce(error)).toBeNull();
  });
});
