import * as bitcoin from "bitcoinjs-lib";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BIP68NotMatureError,
  buildAndBroadcastRefund,
  type BtcBroadcaster,
  type RefundPrePeginContext,
  type VaultRefundData,
} from "../index";

// The SDK's PSBT builder is exercised by its own tests. Here we mock it so
// we can assert the orchestration contract (call order, arg passing, fee
// math, error mapping) without needing WASM or a funded Pre-PegIn vector.
vi.mock("../../../primitives/psbt/refund", () => ({
  buildRefundPsbt: vi
    .fn()
    .mockResolvedValue({ psbtHex: "70736274ff01mock" }),
}));

// Mocked: bitcoinjs-lib is mocked below, real helper would fail to parse.
vi.mock(
  "../../../primitives/psbt/assertPsbtUnsignedTxMatches",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../primitives/psbt/assertPsbtUnsignedTxMatches")
      >();
    return {
      ...actual,
      assertPsbtUnsignedTxMatches: vi.fn(),
    };
  },
);

// Finalize + extract uses bitcoinjs-lib. We stub Psbt.fromHex to return an
// object with controllable `finalizeAllInputs` / `extractTransaction`.
// `Transaction` is kept real because the orchestrator also parses the
// funded Pre-PegIn hex via `readAuthAnchorOpReturn` to extract the
// auth-anchor commitment.
vi.mock("bitcoinjs-lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bitcoinjs-lib")>();
  const psbtInstance = {
    finalizeAllInputs: vi.fn(),
    extractTransaction: vi.fn(() => ({
      toHex: () => "signedtxhex",
    })),
  };
  return {
    ...actual,
    Psbt: {
      fromHex: vi.fn(() => psbtInstance),
    },
  };
});

import { buildRefundPsbt } from "../../../primitives/psbt/refund";
import { Psbt } from "bitcoinjs-lib";

const mockedBuildRefundPsbt = vi.mocked(buildRefundPsbt);
const mockedFromHex = vi.mocked(Psbt.fromHex);

const VAULT_ID = ("0x" + "aa".repeat(32)) as Hex;
const HASHLOCK =
  "0x66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925" as Hex;
const VP_ADDR = ("0x" + "Ab".repeat(20)) as Address;
const APP_ADDR = ("0x" + "Cd".repeat(20)) as Address;
const DEPOSITOR_PUBKEY = "a".repeat(64);
const VP_PUBKEY = "b".repeat(64);
const VK_PUBKEY = "c".repeat(64);
const UC_PUBKEY = "d".repeat(64);

function buildVault(overrides?: Partial<VaultRefundData>): VaultRefundData {
  return {
    hashlock: HASHLOCK,
    htlcVout: 0,
    offchainParamsVersion: 1,
    appVaultKeepersVersion: 1,
    universalChallengersVersion: 1,
    vaultProvider: VP_ADDR,
    applicationEntryPoint: APP_ADDR,
    amount: 100_000n,
    unsignedPrePeginTxHex: "0x0200000001" + "aa".repeat(100),
    depositorBtcPubkey: DEPOSITOR_PUBKEY,
    ...overrides,
  };
}

function buildCtx(
  overrides?: Partial<RefundPrePeginContext>,
): RefundPrePeginContext {
  return {
    vaultProviderPubkey: VP_PUBKEY,
    vaultKeeperPubkeys: [VK_PUBKEY],
    universalChallengerPubkeys: [UC_PUBKEY],
    timelockRefund: 144,
    feeRate: 2n,
    numLocalChallengers: 1,
    councilQuorum: 2,
    councilSize: 3,
    network: "signet",
    ...overrides,
  };
}

describe("buildAndBroadcastRefund", () => {
  let readVault: any;
  let readPrePeginContext: any;
  let signPsbt: any;
  let broadcastTx: any;
  const FEE_RATE = 10;

  beforeEach(() => {
    readVault = vi.fn().mockResolvedValue(buildVault());
    readPrePeginContext = vi.fn().mockResolvedValue(buildCtx());
    signPsbt = vi.fn().mockResolvedValue("signedpsbthex");
    broadcastTx = vi.fn().mockResolvedValue({ txId: "0xrefundtxid" });
    mockedBuildRefundPsbt.mockClear();
    mockedBuildRefundPsbt.mockResolvedValue({ psbtHex: "70736274ff01mock" });
    mockedFromHex.mockClear();
  });

  it("calls readVault, readPrePeginContext, signPsbt, broadcastTx in order", async () => {
    const order: string[] = [];
    readVault.mockImplementation(async () => {
      order.push("readVault");
      return buildVault();
    });
    readPrePeginContext.mockImplementation(async () => {
      order.push("readPrePeginContext");
      return buildCtx();
    });
    signPsbt.mockImplementation(async () => {
      order.push("signPsbt");
      return "signedpsbthex";
    });
    broadcastTx.mockImplementation(async () => {
      order.push("broadcastTx");
      return { txId: "0xrefundtxid" };
    });

    await buildAndBroadcastRefund({
      vaultId: VAULT_ID,
      readVault,
      readPrePeginContext,
      feeRate: FEE_RATE,
      signPsbt,
      broadcastTx,
    });

    expect(order).toEqual([
      "readVault",
      "readPrePeginContext",
      "signPsbt",
      "broadcastTx",
    ]);
  });

  it("rebinds the wallet-signed PSBT against the requested PSBT before broadcasting", async () => {
    const { assertPsbtUnsignedTxMatches } = await import(
      "../../../primitives/psbt/assertPsbtUnsignedTxMatches"
    );
    const rebind = vi.mocked(assertPsbtUnsignedTxMatches);
    rebind.mockClear();

    readVault.mockResolvedValue(buildVault());
    readPrePeginContext.mockResolvedValue(buildCtx());
    signPsbt.mockResolvedValue("signedpsbthex");
    broadcastTx.mockResolvedValue({ txId: "0xrefundtxid" });

    await buildAndBroadcastRefund({
      vaultId: VAULT_ID,
      readVault,
      readPrePeginContext,
      feeRate: FEE_RATE,
      signPsbt,
      broadcastTx,
    });

    expect(rebind).toHaveBeenCalledTimes(1);
    expect(rebind).toHaveBeenCalledWith({
      requestedPsbtHex: "70736274ff01mock",
      returnedPsbtHex: "signedpsbthex",
    });
  });

  it("aborts before broadcast when the rebind helper rejects the wallet's PSBT", async () => {
    const { assertPsbtUnsignedTxMatches } = await import(
      "../../../primitives/psbt/assertPsbtUnsignedTxMatches"
    );
    const rebind = vi.mocked(assertPsbtUnsignedTxMatches);
    rebind.mockClear();
    rebind.mockImplementationOnce(() => {
      throw new Error("output 0 script differs");
    });

    readVault.mockResolvedValue(buildVault());
    readPrePeginContext.mockResolvedValue(buildCtx());
    signPsbt.mockResolvedValue("signedpsbthex");
    broadcastTx.mockClear();

    await expect(
      buildAndBroadcastRefund({
        vaultId: VAULT_ID,
        readVault,
        readPrePeginContext,
        feeRate: FEE_RATE,
        signPsbt,
        broadcastTx,
      }),
    ).rejects.toThrow(/output 0 script differs/);

    expect(broadcastTx).not.toHaveBeenCalled();
  });

  it("forwards broadcastTx rich result unchanged (generic pass-through)", async () => {
    interface RichResult {
      txId: string;
      broadcastedAt: number;
    }
    const richResult: RichResult = { txId: "0xrefundtxid", broadcastedAt: 42 };
    const richBroadcast = vi
      .fn<BtcBroadcaster<RichResult>>()
      .mockResolvedValue(richResult);

    const result = await buildAndBroadcastRefund<RichResult>({
      vaultId: VAULT_ID,
      readVault,
      readPrePeginContext,
      feeRate: FEE_RATE,
      signPsbt,
      broadcastTx: richBroadcast,
    });

    expect(result).toBe(richResult);
  });

  it("computes refundFee = ceil(feeRate * REFUND_VSIZE) using the protocol-owned 160-vbyte constant", async () => {
    await buildAndBroadcastRefund({
      vaultId: VAULT_ID,
      readVault,
      readPrePeginContext,
      feeRate: 10,
      signPsbt,
      broadcastTx,
    });

    // 10 sat/vB * 160 vbytes = 1600 sats
    expect(mockedBuildRefundPsbt).toHaveBeenCalledWith(
      expect.objectContaining({ refundFee: 1600n }),
    );
  });

  it("rounds up non-integer fee products (ceil)", async () => {
    await buildAndBroadcastRefund({
      vaultId: VAULT_ID,
      readVault,
      readPrePeginContext,
      feeRate: 1.251,
      signPsbt,
      broadcastTx,
    });

    // 1.251 sat/vB * 160 vbytes = 200.16 sats → ceil → 201. Using a rate
    // that produces a fractional sat result guards Math.ceil vs. round/floor.
    expect(mockedBuildRefundPsbt).toHaveBeenCalledWith(
      expect.objectContaining({ refundFee: 201n }),
    );
  });

  it("strips 0x prefixes from all hex fields passed to buildRefundPsbt", async () => {
    const vault = buildVault({
      hashlock: HASHLOCK,
      depositorBtcPubkey: "0x" + DEPOSITOR_PUBKEY,
      unsignedPrePeginTxHex: "0x" + "aa".repeat(100),
    });
    readVault.mockResolvedValue(vault);
    readPrePeginContext.mockResolvedValue(
      buildCtx({
        vaultProviderPubkey: "0x" + VP_PUBKEY,
        vaultKeeperPubkeys: ["0x" + VK_PUBKEY],
        universalChallengerPubkeys: ["0x" + UC_PUBKEY],
      }),
    );

    await buildAndBroadcastRefund({
      vaultId: VAULT_ID,
      readVault,
      readPrePeginContext,
      feeRate: FEE_RATE,
      signPsbt,
      broadcastTx,
    });

    const [call] = mockedBuildRefundPsbt.mock.calls;
    expect(call[0].prePeginParams.depositorPubkey).toBe(DEPOSITOR_PUBKEY);
    expect(call[0].prePeginParams.vaultProviderPubkey).toBe(VP_PUBKEY);
    expect(call[0].prePeginParams.vaultKeeperPubkeys).toEqual([VK_PUBKEY]);
    expect(call[0].prePeginParams.universalChallengerPubkeys).toEqual([
      UC_PUBKEY,
    ]);
    expect(call[0].prePeginParams.hashlocks).toEqual([
      HASHLOCK.slice(2),
    ]);
    // The top-level `hashlock` param on buildRefundPsbt is documented as
    // "no 0x prefix" and feeds the WASM HTLC connector derivation. A
    // prefixed value here would derive the wrong refund leaf and yield an
    // unspendable PSBT. Guard the strip explicitly.
    expect(call[0].hashlock).toBe(HASHLOCK.slice(2));
    expect(call[0].hashlock).not.toMatch(/^0x/);
    expect(call[0].fundedPrePeginTxHex).not.toMatch(/^0x/);
  });

  describe("auth-anchor extraction", () => {
    // Build a minimal funded Pre-PegIn tx hex with a configurable
    // shape: N HTLC-placeholder outputs followed by an optional
    // OP_RETURN. The HTLC outputs are placeholders — the orchestrator
    // does not re-derive HTLC content here; the WASM primitive is
    // mocked. We only care that the auth-anchor finder sees the right
    // output layout.
    function buildMinimalFundedPrePeginHex(opts?: {
      authAnchorHashHex?: string;
      numHtlcs?: number;
    }): string {
      const numHtlcs = opts?.numHtlcs ?? 1;
      const tx = new bitcoin.Transaction();
      tx.addInput(Buffer.alloc(32, 0xaa), 0);
      // HTLC placeholders (P2WPKH script — any 22-byte script is fine).
      for (let i = 0; i < numHtlcs; i++) {
        tx.addOutput(Buffer.from("0014" + "11".repeat(20), "hex"), 100_000);
      }
      if (opts?.authAnchorHashHex !== undefined) {
        // OP_RETURN (0x6a) || PUSH32 (0x20) || <32-byte hash>
        tx.addOutput(
          Buffer.from(`6a20${opts.authAnchorHashHex}`, "hex"),
          0,
        );
      }
      return tx.toHex();
    }

    it("extracts authAnchorHash from vout=1 OP_RETURN and forwards it into prePeginParams", async () => {
      const ANCHOR_HASH = "cd".repeat(32);
      const fundedHex = buildMinimalFundedPrePeginHex({
        authAnchorHashHex: ANCHOR_HASH,
      });
      readVault.mockResolvedValue(
        buildVault({ unsignedPrePeginTxHex: "0x" + fundedHex }),
      );

      await buildAndBroadcastRefund({
        vaultId: VAULT_ID,
        readVault,
        readPrePeginContext,
        feeRate: FEE_RATE,
        signPsbt,
        broadcastTx,
      });

      const [call] = mockedBuildRefundPsbt.mock.calls;
      expect(call[0].prePeginParams.authAnchorHash).toBe(ANCHOR_HASH);
    });

    it("passes authAnchorHash = undefined when the funded tx has no OP_RETURN at vout 1 (legacy shape)", async () => {
      const fundedHex = buildMinimalFundedPrePeginHex();
      readVault.mockResolvedValue(
        buildVault({ unsignedPrePeginTxHex: "0x" + fundedHex }),
      );

      await buildAndBroadcastRefund({
        vaultId: VAULT_ID,
        readVault,
        readPrePeginContext,
        feeRate: FEE_RATE,
        signPsbt,
        broadcastTx,
      });

      const [call] = mockedBuildRefundPsbt.mock.calls;
      expect(call[0].prePeginParams.authAnchorHash).toBeUndefined();
    });

    it("normalizes the extracted hash to lowercase (matches WASM hex convention)", async () => {
      // OP_RETURN payloads are raw bytes — they don't have an intrinsic
      // case. The reader normalizes its hex output to lowercase so the
      // unfunded WASM template and any expected-hash comparison stay
      // byte-identical regardless of how callers spell their input.
      const UPPER_ANCHOR_HASH = "AB".repeat(32);
      const fundedHex = buildMinimalFundedPrePeginHex({
        authAnchorHashHex: UPPER_ANCHOR_HASH,
      });
      readVault.mockResolvedValue(
        buildVault({ unsignedPrePeginTxHex: "0x" + fundedHex }),
      );

      await buildAndBroadcastRefund({
        vaultId: VAULT_ID,
        readVault,
        readPrePeginContext,
        feeRate: FEE_RATE,
        signPsbt,
        broadcastTx,
      });

      const [call] = mockedBuildRefundPsbt.mock.calls;
      expect(call[0].prePeginParams.authAnchorHash).toBe("ab".repeat(32));
    });

    it("refuses a 2-vault funded tx (OP_RETURN at vout 2) and does not call buildRefundPsbt", async () => {
      // Multi-vault Pre-PegIn: HTLCs at 0 & 1, OP_RETURN at vout 2.
      // The single-vault refund path reconstructs only one hashlock —
      // the template would not match the funded tx's shape. Refuse
      // structurally instead of producing a wrong refund.
      const fundedHex = buildMinimalFundedPrePeginHex({
        numHtlcs: 2,
        authAnchorHashHex: "cd".repeat(32),
      });
      readVault.mockResolvedValue(
        buildVault({ unsignedPrePeginTxHex: "0x" + fundedHex }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/Multi-vault Pre-PegIn refund is not supported/);

      expect(mockedBuildRefundPsbt).not.toHaveBeenCalled();
      expect(broadcastTx).not.toHaveBeenCalled();
    });

    it("refuses a 3-vault funded tx (OP_RETURN at vout 3) and does not call buildRefundPsbt", async () => {
      const fundedHex = buildMinimalFundedPrePeginHex({
        numHtlcs: 3,
        authAnchorHashHex: "cd".repeat(32),
      });
      readVault.mockResolvedValue(
        buildVault({ unsignedPrePeginTxHex: "0x" + fundedHex }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/auth-anchor OP_RETURN at vout 3/);

      expect(mockedBuildRefundPsbt).not.toHaveBeenCalled();
    });

    it("refuses a funded tx with two OP_RETURN PUSH32 outputs (ambiguous)", async () => {
      const tx = new bitcoin.Transaction();
      tx.addInput(Buffer.alloc(32, 0xaa), 0);
      tx.addOutput(Buffer.from("0014" + "11".repeat(20), "hex"), 100_000);
      tx.addOutput(Buffer.from("6a20" + "cd".repeat(32), "hex"), 0);
      tx.addOutput(Buffer.from("6a20" + "ef".repeat(32), "hex"), 0);
      readVault.mockResolvedValue(
        buildVault({ unsignedPrePeginTxHex: "0x" + tx.toHex() }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/OP_RETURN PUSH32 outputs/);

      expect(mockedBuildRefundPsbt).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("rejects vaultId that is not 32 bytes", async () => {
      await expect(
        buildAndBroadcastRefund({
          vaultId: "0xaa" as Hex,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/vaultId must be 32 bytes/);
      expect(readVault).not.toHaveBeenCalled();
    });

    it("rejects vault with non-bytes32 hashlock", async () => {
      readVault.mockResolvedValue(
        buildVault({ hashlock: "0xaa" as Hex }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/hashlock must be 32 bytes/);
      expect(readPrePeginContext).not.toHaveBeenCalled();
    });

    it("rejects htlcVout = 1 with the multi-vault message", async () => {
      // This SDK call reconstructs a single-hashlock template — any
      // non-zero htlcVout implies a batched (multi-vault) Pre-PegIn
      // whose sibling HTLCs would be silently dropped. Refuse at the
      // input layer before reading any state.
      readVault.mockResolvedValue(buildVault({ htlcVout: 1 }));

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/Multi-vault Pre-PegIn refund is not supported/);
      expect(readPrePeginContext).not.toHaveBeenCalled();
    });

    it.each([Number.NaN, -1, 1.5, 70_000])(
      "rejects non-integer or non-zero htlcVout (%s)",
      async (htlcVout) => {
        readVault.mockResolvedValue(
          buildVault({ htlcVout: htlcVout as number }),
        );

        await expect(
          buildAndBroadcastRefund({
            vaultId: VAULT_ID,
            readVault,
            readPrePeginContext,
            feeRate: FEE_RATE,
            signPsbt,
            broadcastTx,
          }),
        ).rejects.toThrow(/Multi-vault Pre-PegIn refund is not supported/);
      },
    );

    // Version fields flow directly into on-chain script derivation via
    // readPrePeginContext — NaN, negative, or non-integer values would
    // silently produce wrong scripts. Guard each one.
    it.each([
      ["offchainParamsVersion", { offchainParamsVersion: Number.NaN }],
      ["offchainParamsVersion", { offchainParamsVersion: -1 }],
      ["appVaultKeepersVersion", { appVaultKeepersVersion: Number.NaN }],
      ["appVaultKeepersVersion", { appVaultKeepersVersion: 1.5 }],
      ["universalChallengersVersion", { universalChallengersVersion: -1 }],
    ])("rejects invalid %s", async (label, override) => {
      readVault.mockResolvedValue(buildVault(override));

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(new RegExp(`${label} must be a non-negative integer`));
      expect(readPrePeginContext).not.toHaveBeenCalled();
    });

    it("rejects zero or negative amount", async () => {
      readVault.mockResolvedValue(buildVault({ amount: 0n }));

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/amount must be a positive bigint/);
    });

    it("rejects depositor pubkey of invalid hex length (65 chars)", async () => {
      // Regression: {64,66} quantifier would silently accept 65 hex chars
      // (not a valid byte length) and surface an opaque error deep in the
      // WASM PSBT builder. Validation must reject here.
      readVault.mockResolvedValue(
        buildVault({ depositorBtcPubkey: "a".repeat(65) }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/depositorBtcPubkey must be 32 or 33 bytes/);
    });

    it("rejects vault provider pubkey of invalid hex length (65 chars)", async () => {
      readPrePeginContext.mockResolvedValue(
        buildCtx({ vaultProviderPubkey: "b".repeat(65) }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/vaultProviderPubkey must be 32 or 33 bytes/);
    });

    it("rejects empty vaultKeeperPubkeys", async () => {
      readPrePeginContext.mockResolvedValue(
        buildCtx({ vaultKeeperPubkeys: [] }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/vaultKeeperPubkeys must be non-empty/);
    });

    it("rejects empty universalChallengerPubkeys", async () => {
      readPrePeginContext.mockResolvedValue(
        buildCtx({ universalChallengerPubkeys: [] }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/universalChallengerPubkeys must be non-empty/);
    });

    it("rejects councilQuorum > councilSize", async () => {
      readPrePeginContext.mockResolvedValue(
        buildCtx({ councilQuorum: 5, councilSize: 3 }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/councilQuorum \(5\) must be in \[1, councilSize=3\]/);
    });

    it("rejects zero or negative protocol feeRate", async () => {
      readPrePeginContext.mockResolvedValue(buildCtx({ feeRate: 0n }));

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/protocol feeRate must be a positive bigint/);
    });

    it("rejects zero or negative timelockRefund", async () => {
      readPrePeginContext.mockResolvedValue(
        buildCtx({ timelockRefund: 0 }),
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/timelockRefund must be a positive integer/);
    });

    it("rejects zero or negative input feeRate", async () => {
      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: 0,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/feeRate must be a positive number/);
      expect(mockedBuildRefundPsbt).not.toHaveBeenCalled();
    });
  });

  describe("transport & errors", () => {
    it("wraps broadcastTx non-BIP68-final error in BIP68NotMatureError", async () => {
      const cause = new Error(
        "bad-txns-inputs-missingorspent: non-BIP68-final",
      );
      broadcastTx.mockRejectedValue(cause);

      const err = await buildAndBroadcastRefund({
        vaultId: VAULT_ID,
        readVault,
        readPrePeginContext,
        feeRate: FEE_RATE,
        signPsbt,
        broadcastTx,
      }).catch((e) => e);

      expect(err).toBeInstanceOf(BIP68NotMatureError);
      expect(err.vaultId).toBe(VAULT_ID);
      expect(err.cause).toBe(cause);
    });

    it("propagates non-BIP68 broadcastTx errors unchanged", async () => {
      const cause = new Error("network timeout");
      broadcastTx.mockRejectedValue(cause);

      const err = await buildAndBroadcastRefund({
        vaultId: VAULT_ID,
        readVault,
        readPrePeginContext,
        feeRate: FEE_RATE,
        signPsbt,
        broadcastTx,
      }).catch((e) => e);

      expect(err).toBe(cause);
      expect(err).not.toBeInstanceOf(BIP68NotMatureError);
    });

    it("propagates readVault errors unchanged", async () => {
      const cause = new Error("indexer down");
      readVault.mockRejectedValue(cause);

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toBe(cause);
    });

    it("propagates signPsbt errors unchanged", async () => {
      const cause = new Error("wallet rejected");
      signPsbt.mockRejectedValue(cause);

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toBe(cause);
      expect(broadcastTx).not.toHaveBeenCalled();
    });

    it("tolerates already-finalized PSBT (Keystone wallets)", async () => {
      const psbtInstance = {
        finalizeAllInputs: vi.fn(() => {
          throw new Error("Input is already finalized");
        }),
        extractTransaction: vi.fn(() => ({ toHex: () => "signedtxhex" })),
      };
      mockedFromHex.mockReturnValueOnce(
        psbtInstance as unknown as ReturnType<typeof Psbt.fromHex>,
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).resolves.toEqual({ txId: "0xrefundtxid" });
      expect(psbtInstance.extractTransaction).toHaveBeenCalledOnce();
      expect(broadcastTx).toHaveBeenCalledWith("signedtxhex");
    });

    it("throws on unrelated finalize errors", async () => {
      const psbtInstance = {
        finalizeAllInputs: vi.fn(() => {
          throw new Error("bad witness");
        }),
        extractTransaction: vi.fn(),
      };
      mockedFromHex.mockReturnValueOnce(
        psbtInstance as unknown as ReturnType<typeof Psbt.fromHex>,
      );

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/Failed to finalize refund PSBT: bad witness/);
      expect(broadcastTx).not.toHaveBeenCalled();
    });

    it("aborts before any work when signal is pre-aborted", async () => {
      const controller = new AbortController();
      controller.abort(new Error("cancelled"));

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
          signal: controller.signal,
        }),
      ).rejects.toThrow("cancelled");
      expect(readVault).not.toHaveBeenCalled();
    });
  });
});
