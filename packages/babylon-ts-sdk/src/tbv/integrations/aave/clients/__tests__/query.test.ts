/**
 * `getPosition` promises "the position, or null when the account has none".
 *
 * The adapter expresses "none" by reverting `InvalidProxyContract()` from
 * `_getBorrowerProxy`, never by returning a zero proxy, so honouring that
 * promise means catching that one revert. Every other failure has to keep
 * propagating: callers gate signing on this answer, so a swallowed RPC error
 * reported as "no position" would be a silent wrong answer.
 */

import type { Address, Hex, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import { getPosition } from "../query.js";

const ADAPTER = "0x1234567890123456789012345678901234567890" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const PROXY = "0x3333333333333333333333333333333333333333" as Address;
const VAULT_ID =
  "0x4444444444444444444444444444444444444444444444444444444444444444" as Hex;

function clientReturning(value: unknown): PublicClient {
  return {
    readContract: vi.fn().mockResolvedValue(value),
  } as unknown as PublicClient;
}

function clientRejecting(err: unknown): PublicClient {
  return {
    readContract: vi.fn().mockRejectedValue(err),
  } as unknown as PublicClient;
}

/**
 * The shape viem's `readContract` actually throws, captured against the live
 * adapter: a `ContractFunctionExecutionError` whose `cause` is a
 * `ContractFunctionRevertedError` carrying the decoded `data.errorName`.
 *
 * Built as plain objects on purpose. The SDK must recognise a revert raised by
 * a *different physical copy* of viem than the one it imports — the real case
 * for consumers — so nothing here may depend on viem's class identities.
 */
function revertNamed(errorName: string): Error {
  const reverted = Object.assign(new Error("execution reverted"), {
    name: "ContractFunctionRevertedError",
    data: { abiItem: { type: "error", name: errorName }, errorName },
  });
  return Object.assign(new Error('The contract function "getPosition" reverted.'), {
    name: "ContractFunctionExecutionError",
    cause: reverted,
  });
}

describe("getPosition", () => {
  it("returns the position for an account that has a proxy", async () => {
    const client = clientReturning({
      proxyContract: PROXY,
      vaultIds: [VAULT_ID],
      totalCollateralBTC: 100_000n,
    });

    expect(await getPosition(client, ADAPTER, USER)).toEqual({
      proxyContract: PROXY,
      vaultIds: [VAULT_ID],
      totalCollateralBTC: 100_000n,
    });
  });

  it("returns null when the adapter reverts InvalidProxyContract", async () => {
    const client = clientRejecting(revertNamed("InvalidProxyContract"));

    expect(await getPosition(client, ADAPTER, USER)).toBeNull();
  });

  it("propagates a revert that is not InvalidProxyContract", async () => {
    const client = clientRejecting(revertNamed("SomeOtherAdapterError"));

    await expect(getPosition(client, ADAPTER, USER)).rejects.toThrow();
  });

  it("propagates a transport failure instead of reporting no position", async () => {
    const client = clientRejecting(new Error("HTTP request failed"));

    await expect(getPosition(client, ADAPTER, USER)).rejects.toThrow(
      /HTTP request failed/,
    );
  });

  it("does not loop forever on a self-referencing cause chain", async () => {
    const looped: { name: string; cause?: unknown } = {
      name: "ContractFunctionExecutionError",
    };
    looped.cause = looped;
    const client = clientRejecting(looped);

    await expect(getPosition(client, ADAPTER, USER)).rejects.toBe(looped);
  });

  it("returns null when the adapter returns a zero proxy address", async () => {
    const client = clientReturning({
      proxyContract: "0x0000000000000000000000000000000000000000",
      vaultIds: [],
      totalCollateralBTC: 0n,
    });

    expect(await getPosition(client, ADAPTER, USER)).toBeNull();
  });
});
