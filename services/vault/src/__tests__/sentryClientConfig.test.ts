import * as Sentry from "@sentry/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({ init: vi.fn(), setUser: vi.fn() }));

type BeforeSend = NonNullable<
  NonNullable<Parameters<typeof Sentry.init>[0]>["beforeSend"]
>;

describe("Sentry beforeSend", () => {
  let beforeSend: BeforeSend;

  beforeAll(async () => {
    await import("../../sentry.client.config");
    const options = vi.mocked(Sentry.init).mock.calls[0][0];
    beforeSend = options!.beforeSend!;
  });

  it("splits a coded error by its reveal phase", () => {
    const event = beforeSend(
      { type: undefined, tags: { revealPhase: "mined-revert" } },
      { originalException: { code: "CONTRACT_REVERT" } },
    );

    expect(event).toMatchObject({
      fingerprint: ["{{ default }}", "CONTRACT_REVERT", "mined-revert"],
    });
  });

  it("splits a coded error by its cause chain after its reveal phase", () => {
    const event = beforeSend(
      {
        type: undefined,
        tags: {
          revealPhase: "simulation",
          revealCauses: "InternalRpcError>RpcRequestError",
        },
      },
      { originalException: { code: "CONTRACT_EXECUTION_FAILED" } },
    );

    expect(event).toMatchObject({
      fingerprint: [
        "{{ default }}",
        "CONTRACT_EXECUTION_FAILED",
        "simulation",
        "InternalRpcError>RpcRequestError",
      ],
    });
  });

  it("keeps the code-only fingerprint for an event without a reveal phase", () => {
    const event = beforeSend(
      { type: undefined, tags: {} },
      { originalException: { code: "CONTRACT_REVERT" } },
    );

    expect(event).toMatchObject({
      fingerprint: ["{{ default }}", "CONTRACT_REVERT"],
    });
  });
});
