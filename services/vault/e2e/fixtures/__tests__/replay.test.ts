// @vitest-environment node
//
// These are node-side fixture tests - they read a file and decode calldata,
// and none of them touches the DOM. The environment has to be stated because
// the secp256k1 asm.js build validates its inputs with `instanceof
// Uint8Array`, and under jsdom a Node `Buffer` belongs to a different realm:
// every point is rejected as "Expected Point" and `initEccLib` fails.
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, networks, payments } from "bitcoinjs-lib";
import { encodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

import { buildRecordedChain } from "../replay/chain";
import { RECORDED_DEPOSITOR } from "../replay/contracts";
import { isDroppedHost, loadRecordedRun } from "../replay/recording";

const MULTICALL3_ABI = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);

describe("recorded depositor", () => {
  it("reports a public key the wallet-connector accepts for its own address", () => {
    // `validateAddressWithPK` (wallet-connector core/utils/wallet.ts) is
    // exactly this comparison, and it sits on the connect path the capture
    // drives. When the two disagree the connector renders "Public Key
    // Mismatch" whose only buttons are Cancel / Continue Anyway - which either
    // times out the capture's Connect wait or gets photographed.
    initEccLib(ecc);

    const derived = payments.p2tr({
      internalPubkey: Buffer.from(
        RECORDED_DEPOSITOR.BTC_PUBLIC_KEY.slice(2),
        "hex",
      ),
      network: networks.testnet,
    }).address;

    expect(derived).toBe(RECORDED_DEPOSITOR.BTC_ADDRESS);
  });
});

describe("isDroppedHost", () => {
  it("drops the vendor hosts on both their .org and .com domains", () => {
    // `scripts/build-replay-fixture.mjs` used to keep a second copy of this
    // policy that matched bare labels, and the two had drifted: a `.com`
    // wallet host was stripped by the builder and replayed as an Ethereum RPC
    // endpoint by the loader. The app's own CSP names verify.walletconnect.com.
    for (const host of [
      "o4509434277003264.ingest.de.sentry.io",
      "api.web3modal.org",
      "api.web3modal.com",
      "verify.walletconnect.com",
      "relay.walletconnect.org",
      "demo.vault-devnet.babylonlabs.io",
      "utils-api.vault-devnet.babylonlabs.io",
    ]) {
      expect(isDroppedHost(host)).toBe(true);
    }
  });

  it("keeps a lookalike domain that merely ends in a dropped one's name", () => {
    // Dot-anchored, so this is "this domain" rather than "these characters
    // appear somewhere". A bare substring would drop a host nobody meant to.
    expect(isDroppedHost("sentry.io.example.com")).toBe(false);
    expect(isDroppedHost("ethereum-sepolia-rpc.publicnode.com")).toBe(false);
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

  it("reports a batch that is not aggregate3 instead of throwing past the route", () => {
    // Throwing here would escape the Playwright route handler: the request is
    // never fulfilled, no miss is logged, and `unanswered` stays empty - so
    // the capture gates pass while the screen renders without that data.
    const run = loadRecordedRun();
    const chain = buildRecordedChain(run);
    const tryAggregate = encodeFunctionData({
      abi: parseAbi([
        "function tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls) returns ((bool success, bytes returnData)[])",
      ]),
      functionName: "tryAggregate",
      args: [false, []],
    });

    expect(chain.answerMulticall(tryAggregate)).toBeNull();
    expect(chain.unanswered).toEqual([
      {
        target: "0xca11bde05977b3631167028862be2a173976ca11",
        selector: tryAggregate.slice(0, 10),
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

  it("answers an unrecorded argument to a getter the recording saw once", () => {
    // The fallback that makes the fixture survive a re-composed batch: the
    // registry's `pauseState()` takes no argument, so there is exactly one
    // calldata behind the pair and any caller asking it gets that answer.
    const run = loadRecordedRun();
    const chain = buildRecordedChain(run);

    expect(
      chain.answerCall(
        "0xb331467c4db13dccc77fa66c2d185b74ed57ab80",
        encodeFunctionData({
          abi: parseAbi(["function pauseState() view returns (uint8)"]),
        }),
      ),
    ).not.toBeNull();
  });

  it("refuses an unrecorded argument to a getter the recording saw with several", () => {
    // `getReservesPrices` is recorded three times, once per borrowable
    // reserve. The vault's own vBTC reserve - id 3 - is never priced, so
    // falling back on the pair would answer with the previous reserve's
    // price: a plausible BTC figure the recording never justified, rendered
    // onto the very form this capture photographs. Unanswered is the only
    // honest reply, and it is the one the gates can see.
    const run = loadRecordedRun();
    const chain = buildRecordedChain(run);
    const getReservesPrices = parseAbi([
      "function getReservesPrices(uint256[] ids) view returns (uint256[])",
    ]);

    expect(
      chain.answerCall(
        "0xcdcb913a1f6dfdcf7779ab841931cc37e48e3569",
        encodeFunctionData({
          abi: getReservesPrices,
          args: [[2n]],
        }),
      ),
    ).not.toBeNull();

    expect(
      chain.answerCall(
        "0xcdcb913a1f6dfdcf7779ab841931cc37e48e3569",
        encodeFunctionData({
          abi: getReservesPrices,
          args: [[3n]],
        }),
      ),
    ).toBeNull();
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
