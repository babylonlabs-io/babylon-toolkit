import type { GetPegoutStatusResponse } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RedeemedVaultInfo } from "@/applications/aave/hooks/useAaveVaults";
import {
  ClaimerPegoutStatusValue,
  PEGOUT_MAX_CONSECUTIVE_FAILURES,
} from "@/models/pegoutStateMachine";

import { resetSharedPegoutTerminalTracking } from "../pegoutTerminalEvents";
import { usePegoutPolling } from "../usePegoutPolling";

/**
 * What the next poll cycle should feed every vault: a per-item envelope, or
 * "batch_error" to fail the whole provider batch (drives the
 * consecutive-failures give-up path).
 */
type PollScript =
  | { error: string | null; result: GetPegoutStatusResponse | null }
  | "batch_error";

const { pollScript, mockEvent } = vi.hoisted(() => ({
  pollScript: { current: undefined as PollScript | undefined },
  mockEvent: vi.fn(),
}));

// Replace the SDK's batch poller so each poll cycle serves the scripted
// envelope without touching the network; everything downstream of it —
// counters, give-up thresholds, the emission effect — runs for real.
vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@babylonlabs-io/ts-sdk/tbv/core/clients")
    >();
  return {
    ...actual,
    batchPollByProvider: async (opts: {
      items: { vault: { id: string } }[];
      onItem: (
        item: { vault: { id: string } },
        envelope: {
          error: string | null;
          result: GetPegoutStatusResponse | null;
        },
      ) => void;
      onWholeBatchError: (
        chunk: { vault: { id: string } }[],
        error: unknown,
      ) => void;
    }) => {
      const script = pollScript.current;
      if (script === undefined) {
        throw new Error("pollScript.current not set before a poll cycle");
      }
      if (script === "batch_error") {
        opts.onWholeBatchError(opts.items, new Error("provider down"));
        return;
      }
      for (const item of opts.items) {
        opts.onItem(item, script);
      }
    },
  };
});

// The provider client is only dereferenced inside the (mocked-away) batch
// poller, so a stub satisfies the hook.
vi.mock("@/utils/rpc", () => ({
  createVpClient: () => ({}),
}));

vi.mock("@/infrastructure", () => ({
  logger: { event: mockEvent, error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// The hook pins per-query retry options (3 retries, 5s delay), which beat any
// QueryClient default and would stretch a throwing queryFn (e.g. the
// unset-script guard above) into an opaque test timeout — zero them so a
// scripting mistake fails fast instead.
vi.mock("@/config/polling", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/polling")>();
  return { ...actual, POLLING_RETRY_COUNT: 0, POLLING_RETRY_DELAY_MS: 0 };
});

// Long enough for shortId to shorten; distinct head/tail pin the redaction.
const VAULT_ID = `0x22${"cd".repeat(29)}9999`;

const VAULT: RedeemedVaultInfo = {
  id: VAULT_ID,
  peginTxHash: `0x${"cd".repeat(32)}`,
  amountBtc: 0.1,
  providerName: "provider",
  vaultProviderAddress: `0x${"ef".repeat(20)}`,
  createdAt: 1700000000000,
  offchainParamsVersion: 0,
};

function statusEnvelope(claimerStatus: string): PollScript {
  return {
    error: null,
    result: {
      found: true,
      claimer: { status: claimerStatus },
    } as GetPegoutStatusResponse,
  };
}

function renderPolling() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    () => usePegoutPolling({ redeemedVaults: [VAULT] }),
    { wrapper },
  );
  const pollAgain = async () => {
    await act(async () => {
      await queryClient.refetchQueries();
      // The observer notification for the refreshed data lands a tick after
      // the refetch promise resolves — flush it so assertions that follow
      // (including negative ones) observe the post-poll render.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  return { ...rendered, pollAgain };
}

describe("pegout terminal emission through usePegoutPolling", () => {
  beforeEach(() => {
    mockEvent.mockClear();
    pollScript.current = undefined;
    // The tracking store is module-scoped and outlives the hook, so it also
    // outlives a test case. Without this reset a later case starts with the
    // vault already seen and silently observes nothing.
    resetSharedPegoutTerminalTracking();
  });

  it("emits payout_broadcast once, without a timeoutReason key, when a polled vault reaches it", async () => {
    pollScript.current = statusEnvelope(
      ClaimerPegoutStatusValue.CLAIM_BROADCAST,
    );
    const { result, pollAgain } = renderPolling();
    await waitFor(() => expect(result.current.pegoutStatuses.size).toBe(1));
    expect(mockEvent).not.toHaveBeenCalled();

    pollScript.current = statusEnvelope(
      ClaimerPegoutStatusValue.PAYOUT_BROADCAST,
    );
    await pollAgain();

    expect(mockEvent).toHaveBeenCalledTimes(1);
    // Pins level/category and the shortened vaultId.
    expect(mockEvent).toHaveBeenCalledWith("exit.redeem.payout_broadcast", {
      level: "info",
      category: "exit",
      vaultId: "0x22...9999",
    });
    // toEqual-style matching treats `{ timeoutReason: undefined }` as equal to
    // the object above, so pin the key's ABSENCE separately — this is what
    // fails if the conditional spread regresses to an unconditional one.
    expect(mockEvent.mock.calls[0][1]).not.toHaveProperty("timeoutReason");

    // Sticky terminal re-observed — the shared store suppresses a re-emit.
    await pollAgain();
    expect(mockEvent).toHaveBeenCalledTimes(1);
  });

  it("seeds a vault already terminal on its first poll without emitting", async () => {
    pollScript.current = statusEnvelope(
      ClaimerPegoutStatusValue.PAYOUT_BROADCAST,
    );
    const { result, pollAgain } = renderPolling();
    await waitFor(() => expect(result.current.pegoutStatuses.size).toBe(1));

    await pollAgain();
    expect(mockEvent).not.toHaveBeenCalled();
  });

  it("emits pegout_timeout with the consecutive_failures facet after polling gives up", async () => {
    pollScript.current = statusEnvelope(
      ClaimerPegoutStatusValue.CLAIM_BROADCAST,
    );
    const { result, pollAgain } = renderPolling();
    await waitFor(() => expect(result.current.pegoutStatuses.size).toBe(1));

    pollScript.current = "batch_error";
    for (let i = 0; i < PEGOUT_MAX_CONSECUTIVE_FAILURES; i++) {
      await pollAgain();
    }

    expect(mockEvent).toHaveBeenCalledTimes(1);
    expect(mockEvent).toHaveBeenCalledWith("exit.redeem.pegout_timeout", {
      level: "warning",
      category: "exit",
      vaultId: "0x22...9999",
      timeoutReason: "consecutive_failures",
    });
  });
});
