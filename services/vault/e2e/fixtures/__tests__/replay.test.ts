import { address as btcAddress } from "bitcoinjs-lib";
import { encodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

import { buildRecordedChain } from "../replay/chain";
import { RECORDED_DEPOSITOR } from "../replay/contracts";
import { loadRecordedRun } from "../replay/recording";

const MULTICALL3_ABI = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);

describe("recorded depositor", () => {
  it("derives its x-only public key from its own taproot address", () => {
    const decoded = btcAddress.fromBech32(RECORDED_DEPOSITOR.BTC_ADDRESS);

    expect(decoded.data.toString("hex")).toBe(
      RECORDED_DEPOSITOR.BTC_X_ONLY_PUBLIC_KEY,
    );
  });
});

describe("loadRecordedRun", () => {
  it("stops at the requested step", () => {
    const run = loadRecordedRun(undefined, "deposit-form");

    expect(run.entries.at(-1)?.step).toBe("deposit-form");
    expect(run.entries.some((entry) => entry.step === "connect")).toBe(true);
    expect(run.entries.some((entry) => entry.step === "sign-transaction")).toBe(
      false,
    );
  });

  it("replays the confirmed balance at the deposit form, not the spent one", () => {
    // The whole reason the run is cut: the depositor holds a confirmed
    // 2,500,000 sat UTXO while looking at the form and unconfirmed change
    // afterwards. Replaying the later state renders "Balance: --" on a screen
    // whose entire subject is what you can deposit.
    const run = loadRecordedRun(undefined, "deposit-form");
    const utxos = (run.byBackend.get("mempool") ?? []).filter((entry) =>
      entry.url.endsWith("/utxo"),
    );

    expect(JSON.parse(utxos.at(-1)?.resBody ?? "[]")).toEqual([
      expect.objectContaining({ value: 2_500_000 }),
    ]);
  });

  it("names the steps it does have when asked for one it does not", () => {
    expect(() => loadRecordedRun(undefined, "no-such-step")).toThrow(
      /no exchange recorded during step "no-such-step"/,
    );
  });
});

describe("buildRecordedChain", () => {
  it("answers an inner call that was only ever recorded inside a batch", () => {
    const run = loadRecordedRun();
    const chain = buildRecordedChain(run);

    // `pauseState()` on the registry is never called directly in the
    // recording - it exists only as one leg of an aggregate3 batch. Answering
    // it on its own is the whole point of taking batches apart, and is what
    // lets the app re-compose its reads differently from the recording.
    const pauseState = encodeFunctionData({
      abi: parseAbi(["function pauseState() view returns (uint8)"]),
    });

    expect(
      chain.answerCall(
        "0xb331467c4db13dccc77fa66c2d185b74ed57ab80",
        pauseState,
      ),
    ).not.toBeNull();
  });

  it("answers a batch the recording never saw, composed of calls it did", () => {
    const run = loadRecordedRun();
    const chain = buildRecordedChain(run);
    const pauseState = encodeFunctionData({
      abi: parseAbi(["function pauseState() view returns (uint8)"]),
    });

    // Two targets the recording batches separately, asked for together.
    const encoded = chain.answerMulticall(
      encodeFunctionData({
        abi: MULTICALL3_ABI,
        functionName: "aggregate3",
        args: [
          [
            {
              target: "0xb331467c4db13dccc77fa66c2d185b74ed57ab80",
              allowFailure: true,
              callData: pauseState,
            },
            {
              target: "0x31bc43cab2d91b3016bee8e9fc1194d46d7b0590",
              allowFailure: true,
              callData: pauseState,
            },
          ],
        ],
      }),
    );

    expect(encoded).not.toBe("0x");
    expect(chain.unanswered).toEqual([]);
  });

  it("reports an unanswerable inner call instead of fabricating a result", () => {
    const run = loadRecordedRun();
    const chain = buildRecordedChain(run);
    const unknown = encodeFunctionData({
      abi: parseAbi(["function neverRecorded() view returns (uint256)"]),
    });

    chain.answerMulticall(
      encodeFunctionData({
        abi: MULTICALL3_ABI,
        functionName: "aggregate3",
        args: [
          [
            {
              target: "0xb331467c4db13dccc77fa66c2d185b74ed57ab80",
              allowFailure: true,
              callData: unknown,
            },
          ],
        ],
      }),
    );

    expect(chain.unanswered).toEqual([
      {
        target: "0xb331467c4db13dccc77fa66c2d185b74ed57ab80",
        selector: unknown.slice(0, 10),
      },
    ]);
  });

  it("keeps each view's unanswered calls to itself", () => {
    // One screen's miss must not be reported against the next screen, or the
    // failure message names the wrong capture.
    const run = loadRecordedRun();
    const first = buildRecordedChain(run);
    const second = buildRecordedChain(run);
    const unknown = encodeFunctionData({
      abi: parseAbi(["function neverRecorded() view returns (uint256)"]),
    });

    first.answerCall("0xb331467c4db13dccc77fa66c2d185b74ed57ab80", unknown);
    first.answerMulticall(
      encodeFunctionData({
        abi: MULTICALL3_ABI,
        functionName: "aggregate3",
        args: [
          [
            {
              target: "0xb331467c4db13dccc77fa66c2d185b74ed57ab80",
              allowFailure: true,
              callData: unknown,
            },
          ],
        ],
      }),
    );

    expect(first.unanswered).toHaveLength(1);
    expect(second.unanswered).toEqual([]);
  });

  it("supplies the vBTC reserve id the recording predates, from the recording", () => {
    const run = loadRecordedRun();
    const chain = buildRecordedChain(run);
    const abi = parseAbi([
      "function VAULT_BTC_RESERVE_ID() view returns (uint256)",
    ]);

    const answer = chain.answerCall(
      "0x31bc43cab2d91b3016bee8e9fc1194d46d7b0590",
      encodeFunctionData({ abi }),
    );

    // 3 is the id the recorded GetAaveAppConfig response reports; the app
    // throws unless the on-chain read agrees with it.
    expect(BigInt(answer ?? "0x0")).toBe(3n);
  });
});
