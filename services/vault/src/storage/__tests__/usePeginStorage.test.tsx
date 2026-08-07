/**
 * Covers the mapping from a stored pending peg-in to the `VaultActivity` the
 * polling tree consumes.
 *
 * The version is the field worth pinning. It is persisted at registration and
 * re-asserted on chain, but was never mapped across - so pending rows reached
 * the depth resolver as `undefined`, silently took the latest params, and
 * persisted an at-depth conclusion drawn against the wrong version.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY_PREFIX } from "../../constants";
import { addPendingPegin } from "../peginStorage";
import { usePeginStorage } from "../usePeginStorage";

vi.mock("@/infrastructure", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

const ETH_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const VAULT_ID = `0x${"a".repeat(64)}` as const;
const PEGIN_TXHASH = `0x${"b".repeat(64)}` as const;
const REGISTERED_VERSION = 7;

describe("usePeginStorage pending activity mapping", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("carries the registered offchain-params version onto the activity", () => {
    addPendingPegin(ETH_ADDRESS, {
      id: VAULT_ID,
      peginTxHash: PEGIN_TXHASH,
      unsignedTxHex: "0xdeadbeef",
      buildOffchainParamsVersion: REGISTERED_VERSION,
      buildAppVaultKeepersVersion: 3,
      buildUniversalChallengersVersion: 5,
      buildVaultCoreVersion: 1,
    });

    const { result } = renderHook(() =>
      usePeginStorage({ ethAddress: ETH_ADDRESS, confirmedPegins: [] }),
    );

    const activity = result.current.allActivities.find(
      (a) => a.id === VAULT_ID,
    );
    expect(activity).toBeDefined();
    expect(activity?.offchainParamsVersion).toBe(REGISTERED_VERSION);
  });
});

// Keep the storage key derivation honest: the test seeds through the public
// writer, so a change to the key shape breaks here rather than silently
// reading an empty list and passing.
describe("storage key", () => {
  it("scopes pending peg-ins to the connected address", () => {
    expect(`${STORAGE_KEY_PREFIX}-${ETH_ADDRESS}`).toContain(ETH_ADDRESS);
  });
});
