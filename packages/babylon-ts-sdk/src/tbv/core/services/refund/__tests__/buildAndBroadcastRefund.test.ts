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

// Finalize + extract uses bitcoinjs-lib. We stub Psbt.fromHex to return an
// object with controllable `finalizeAllInputs` / `extractTransaction`.
vi.mock("bitcoinjs-lib", async () => {
  const psbtInstance = {
    finalizeAllInputs: vi.fn(),
    extractTransaction: vi.fn(() => ({
      toHex: () => "signedtxhex",
    })),
  };
  return {
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
    htlcVout: 1,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let readVault: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let readPrePeginContext: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let signPsbt: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    it("rejects htlcVout out of range", async () => {
      readVault.mockResolvedValue(buildVault({ htlcVout: 70000 }));

      await expect(
        buildAndBroadcastRefund({
          vaultId: VAULT_ID,
          readVault,
          readPrePeginContext,
          feeRate: FEE_RATE,
          signPsbt,
          broadcastTx,
        }),
      ).rejects.toThrow(/htlcVout must be an integer/);
    });

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
