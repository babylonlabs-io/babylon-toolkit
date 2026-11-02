import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import {
  decodeFunctionData,
  InsufficientFundsError,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MockEthereumWallet } from "../../../../../testing/MockEthereumWallet";
import { BTCVaultRegistryABI, EMPTY_REVERT_MESSAGE } from "../../../contracts";
import {
  ViemPeginRegistrationClient,
  type RegisterPeginBatchOnChainParams,
  type RegisterPeginOnChainParams,
} from "../pegin-registration-client";

const REGISTRY = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address;
const OTHER_ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;
const OTHER_PROVIDER = "0x2222222222222222222222222222222222222222" as Address;
const DELEGATED_EOA_CODE = "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b";
const BTC_KEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const COMPRESSED_BTC_KEY = `02${BTC_KEY}`;
const OTHER_COMPRESSED_BTC_KEY =
  "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const PAYOUT_SCRIPT = "0x0014751e76e8199196d454941c45d1b3a323f1433bd6";
const HASHLOCK = `0x${"cd".repeat(32)}` as Hex;
const WOTS_PK_HASH = `0x${"ef".repeat(32)}` as Hex;
// Distinct from the other bytes32 fixtures, so an assertion on the wrong
// argument slot fails instead of matching a neighbour.
const FINGERPRINT = `0x${"7c".repeat(32)}` as Hex;

function signedPeginTransaction(seed = 0xab): string {
  const transaction = new Transaction();
  transaction.version = 2;
  transaction.addInput(Buffer.alloc(32, seed), 0);
  transaction.addOutput(Buffer.alloc(34, 0xcd), 50_000);
  transaction.setWitness(0, [Buffer.alloc(64, 0x11)]);
  return transaction.toHex();
}

function setup(requireQuotedCommissionBps = false) {
  const ethWallet = new MockEthereumWallet();
  const getAddresses = vi.fn(async () => [ethWallet.account.address]);
  Object.assign(ethWallet, { getAddresses });
  const publicClient = {
    chain: sepolia,
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      if (functionName === "getPegInFee") return Promise.resolve(3n);
      if (functionName === "getVaultProviderCommission")
        return Promise.resolve(100);
      return Promise.resolve({ depositor: zeroAddress as Address });
    }),
    estimateGas: vi.fn().mockResolvedValue(250_000n),
    prepareTransactionRequest: vi.fn().mockResolvedValue({
      type: "eip1559",
      maxFeePerGas: 3n,
      maxPriorityFeePerGas: 1n,
    }),
    getBalance: vi.fn().mockResolvedValue(250_000n * 3n + 6n),
    getCode: vi.fn().mockResolvedValue("0x"),
    waitForTransactionReceipt: vi.fn(({ hash }: { hash: `0x${string}` }) =>
      Promise.resolve({ status: "success", transactionHash: hash }),
    ),
  };
  const client = new ViemPeginRegistrationClient({
    ethWallet: ethWallet as never,
    ethChain: sepolia,
    publicClient: publicClient as never,
    btcVaultRegistry: REGISTRY,
    requireQuotedCommissionBps,
  });
  return { client, ethWallet, publicClient, getAddresses };
}

function singleParams(depositor: Address): RegisterPeginOnChainParams {
  return {
    unsignedPrePeginTx: signedPeginTransaction(0xaa),
    depositorSignedPeginTx: signedPeginTransaction(),
    vaultProvider: REGISTRY,
    hashlock: HASHLOCK,
    depositorWotsPkHash: WOTS_PK_HASH,
    popSignature: {
      depositorEthAddress: depositor,
      depositorBtcPubkey: BTC_KEY,
      btcPopSignature: "0x0102",
    },
    depositorBtcPubkeyRaw: COMPRESSED_BTC_KEY,
    htlcVout: 0,
    depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
    quotedCommissionBps: 100,
    quotedPeginFeeWei: 3n,
    expectedFingerprint: FINGERPRINT,
  };
}

function batchParams(depositor: Address): RegisterPeginBatchOnChainParams {
  const single = singleParams(depositor);
  return {
    vaultProvider: single.vaultProvider,
    unsignedPrePeginTx: single.unsignedPrePeginTx,
    popSignature: single.popSignature,
    depositorBtcPubkeyRaw: single.depositorBtcPubkeyRaw,
    quotedCommissionBps: single.quotedCommissionBps,
    quotedPeginFeeWei: single.quotedPeginFeeWei,
    expectedFingerprint: single.expectedFingerprint,
    requests: [
      {
        depositorSignedPeginTx: single.depositorSignedPeginTx,
        hashlock: single.hashlock,
        htlcVout: single.htlcVout,
        depositorPayoutScriptPubKey: single.depositorPayoutScriptPubKey,
        depositorWotsPkHash: single.depositorWotsPkHash,
      },
    ],
  };
}

function register(
  client: ViemPeginRegistrationClient,
  depositor: Address,
  path: "single" | "batch",
) {
  return path === "single"
    ? client.registerPeginOnChain(singleParams(depositor))
    : client.registerPeginBatchOnChain(batchParams(depositor));
}

function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const INVALID_SINGLE_PARAMS: Array<
  [string, Partial<RegisterPeginOnChainParams>, RegExp?]
> = [
  ["a malformed hashlock", { hashlock: "0x01" }],
  ["a malformed depositor WOTS key hash", { depositorWotsPkHash: "0x01" }],
  ["malformed transaction hex", { depositorSignedPeginTx: "not-hex" }],
  ["htlcVout -1", { htlcVout: -1 }],
  ["htlcVout 1.5", { htlcVout: 1.5 }],
  ["htlcVout NaN", { htlcVout: Number.NaN }],
  ["htlcVout 256", { htlcVout: 256 }],
  [
    "an off-curve payout BTC pubkey",
    { depositorBtcPubkeyRaw: `02${"00".repeat(32)}` },
    /not a valid BTC pubkey/,
  ],
  [
    "a payout BTC pubkey for another key",
    { depositorBtcPubkeyRaw: OTHER_COMPRESSED_BTC_KEY },
    /does not match the proof of possession BTC pubkey/,
  ],
];

describe("ViemPeginRegistrationClient", () => {
  afterEach(() => vi.restoreAllMocks());
  it("registers prepared Bitcoin artifacts without a BTC wallet", async () => {
    const { client, ethWallet } = setup();
    const send = vi.spyOn(ethWallet, "sendTransaction");
    const result = await client.registerPeginOnChain(
      singleParams(ethWallet.account.address),
    );

    expect(result.vaultId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.peginTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    const decoded = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: send.mock.calls[0][0].data!,
    });
    expect(decoded.functionName).toBe("submitPeginRequest");
    expect((decoded.args as readonly unknown[])[9]).toBe(PAYOUT_SCRIPT);
  });

  it("reports an explicitly empty revert at gas estimation with the neutral message, sending nothing", async () => {
    const { client, ethWallet, publicClient } = setup();
    const send = vi.spyOn(ethWallet, "sendTransaction");
    publicClient.estimateGas.mockRejectedValueOnce(
      Object.assign(new Error("execution reverted"), { data: "0x" }),
    );

    await expect(
      client.registerPeginOnChain(singleParams(ethWallet.account.address)),
    ).rejects.toThrow(EMPTY_REVERT_MESSAGE);
    expect(send).not.toHaveBeenCalled();
  });

  it("estimates gas without fee fields and prepares fees for that estimate", async () => {
    const { client, ethWallet, publicClient } = setup();

    await client.registerPeginOnChain(singleParams(ethWallet.account.address));

    expect(publicClient.estimateGas).toHaveBeenCalledWith({
      to: REGISTRY,
      data: expect.any(String),
      value: 3n,
      account: ethWallet.account.address,
    });
    expect(publicClient.prepareTransactionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ gas: 250_000n, parameters: ["fees", "type"] }),
    );
  });

  it("reports an explicitly empty revert at send with the neutral message", async () => {
    const { client, ethWallet } = setup();
    vi.spyOn(ethWallet, "sendTransaction").mockRejectedValueOnce(
      Object.assign(new Error("execution reverted"), { data: "0x" }),
    );

    await expect(
      client.registerPeginOnChain(singleParams(ethWallet.account.address)),
    ).rejects.toThrow(EMPTY_REVERT_MESSAGE);
  });

  it.each(["eip1559", "legacy"] as const)(
    "submits at the exact total cost with the prepared %s fee cap",
    async (type) => {
      for (const code of ["0x", DELEGATED_EOA_CODE]) {
        const { client, ethWallet, publicClient } = setup();
        publicClient.getCode.mockResolvedValue(code);
        const fees =
          type === "eip1559"
            ? { type, maxFeePerGas: 3n, maxPriorityFeePerGas: 1n }
            : { type, gasPrice: 3n };
        publicClient.prepareTransactionRequest.mockResolvedValueOnce(fees);
        publicClient.getBalance.mockResolvedValueOnce(250_000n * 3n + 3n);
        const send = vi.spyOn(ethWallet, "sendTransaction");

        await client.registerPeginOnChain(
          singleParams(ethWallet.account.address),
        );

        expect(publicClient.getBalance).toHaveBeenCalledWith({
          address: ethWallet.account.address,
        });
        expect(send).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 250_000n, ...fees }),
        );
        expect(send.mock.calls[0][0]).not.toHaveProperty("nonce");
      }
    },
  );

  it.each(["eip1559", "legacy"] as const)(
    "refuses one wei below the total %s cost before the wallet prompt",
    async (type) => {
      for (const code of ["0x", DELEGATED_EOA_CODE]) {
        const { client, ethWallet, publicClient } = setup();
        publicClient.getCode.mockResolvedValue(code);
        publicClient.prepareTransactionRequest.mockResolvedValueOnce(
          type === "eip1559"
            ? { type, maxFeePerGas: 3n, maxPriorityFeePerGas: 1n }
            : { type, gasPrice: 3n },
        );
        publicClient.getBalance.mockResolvedValueOnce(250_000n * 3n + 3n - 1n);
        const send = vi.spyOn(ethWallet, "sendTransaction");

        await expect(
          client.registerPeginOnChain(singleParams(ethWallet.account.address)),
        ).rejects.toMatchObject({
          name: "InsufficientFundsError",
          required: 750_003n,
          balance: 750_002n,
        });
        expect(send).not.toHaveBeenCalled();
      }
    },
  );

  it.each(["single", "batch"] as const)(
    "submits a Safe %s proposal with exactly the registration value",
    async (path) => {
      const { client, ethWallet, publicClient } = setup();
      publicClient.getCode.mockResolvedValue("0x60806040");
      publicClient.getBalance.mockResolvedValueOnce(3n);
      const transactionHash = `0x${"42".repeat(32)}` as Hex;
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ isExecuted: true, transactionHash })),
      );
      const send = vi.spyOn(ethWallet, "sendTransaction");

      const result = await register(client, ethWallet.account.address, path);

      expect(publicClient.estimateGas).toHaveBeenCalledWith({
        to: REGISTRY,
        data: expect.any(String),
        value: 3n,
        account: ethWallet.account.address,
      });
      expect(publicClient.prepareTransactionRequest).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith({
        to: REGISTRY,
        data: expect.any(String),
        value: 3n,
        account: ethWallet.account.address,
        chain: sepolia,
      });
      expect(result.ethTxHash).toBe(transactionHash);
    },
  );

  it.each(["single", "batch"] as const)(
    "refuses a Safe %s proposal one wei below the registration value",
    async (path) => {
      const { client, ethWallet, publicClient } = setup();
      publicClient.getCode.mockResolvedValue("0x60806040");
      publicClient.getBalance.mockResolvedValueOnce(2n);
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(
        register(client, ethWallet.account.address, path),
      ).rejects.toMatchObject({
        name: "InsufficientFundsError",
        required: 3n,
        balance: 2n,
      });
      expect(publicClient.estimateGas).not.toHaveBeenCalled();
      expect(publicClient.prepareTransactionRequest).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("refuses an EOA below the registration value before any node call", async () => {
    const { client, ethWallet, publicClient } = setup();
    publicClient.getBalance.mockResolvedValueOnce(2n);
    const send = vi.spyOn(ethWallet, "sendTransaction");

    await expect(
      client.registerPeginOnChain(singleParams(ethWallet.account.address)),
    ).rejects.toMatchObject({
      name: "InsufficientFundsError",
      required: 3n,
      balance: 2n,
    });
    expect(publicClient.estimateGas).not.toHaveBeenCalled();
    expect(publicClient.prepareTransactionRequest).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["single", "batch"] as const)(
    "reports a registry revert for a Safe %s before proposing it",
    async (path) => {
      const { client, ethWallet, publicClient } = setup();
      publicClient.getCode.mockResolvedValue("0x60806040");
      publicClient.estimateGas.mockRejectedValueOnce(
        Object.assign(new Error("execution reverted"), { data: "0x" }),
      );
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("no network in tests"),
      );
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(
        register(client, ethWallet.account.address, path),
      ).rejects.toThrow(EMPTY_REVERT_MESSAGE);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("refuses a two-vault batch when only one registration fee is covered", async () => {
    const { client, ethWallet, publicClient } = setup();
    const params = batchParams(ethWallet.account.address);
    params.requests.push({
      ...params.requests[0],
      depositorSignedPeginTx: signedPeginTransaction(0xac),
      htlcVout: 1,
    });
    params.quotedPeginFeeWei = 6n;
    publicClient.getBalance.mockResolvedValueOnce(250_000n * 3n + 3n);
    const send = vi.spyOn(ethWallet, "sendTransaction");

    await expect(
      client.registerPeginBatchOnChain(params),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(publicClient.prepareTransactionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ value: 6n }),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it.each([undefined, 0n, -1n])(
    "refuses an unusable gas estimate (%s) before the wallet prompt",
    async (gas) => {
      const { client, ethWallet, publicClient } = setup();
      publicClient.estimateGas.mockResolvedValueOnce(gas as never);
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(
        client.registerPeginOnChain(singleParams(ethWallet.account.address)),
      ).rejects.toThrow(/Failed to estimate registration gas/);
      expect(publicClient.prepareTransactionRequest).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    { type: "eip1559", maxPriorityFeePerGas: 1n },
    { type: "eip1559", maxFeePerGas: 3n },
    { type: "legacy" },
  ])(
    "refuses incomplete fee data before the wallet prompt",
    async (request) => {
      const { client, ethWallet, publicClient } = setup();
      publicClient.prepareTransactionRequest.mockResolvedValueOnce(request);
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(
        client.registerPeginOnChain(singleParams(ethWallet.account.address)),
      ).rejects.toThrow(/Failed to prepare registration fees/);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    "getCode",
    "estimateGas",
    "prepareTransactionRequest",
    "getBalance",
  ] as const)(
    "stops before the wallet prompt when %s fails",
    async (method) => {
      const { client, ethWallet, publicClient } = setup();
      const error = new Error("Ethereum RPC read failed");
      publicClient[method].mockRejectedValueOnce(error);
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(
        client.registerPeginOnChain(singleParams(ethWallet.account.address)),
      ).rejects.toBe(error);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("passes a wallet rejection at send through unchanged", async () => {
    const { client, ethWallet } = setup();
    const rejection = Object.assign(new Error("User rejected the request."), {
      code: 4001,
    });
    vi.spyOn(ethWallet, "sendTransaction").mockRejectedValueOnce(rejection);

    await expect(
      client.registerPeginOnChain(singleParams(ethWallet.account.address)),
    ).rejects.toBe(rejection);
  });

  it("accepts an uppercase hex prefix on the PoP BTC pubkey", async () => {
    const { client, ethWallet } = setup();
    const params = singleParams(ethWallet.account.address);
    params.popSignature.depositorBtcPubkey = `0X${BTC_KEY.toUpperCase()}`;

    await expect(client.registerPeginOnChain(params)).resolves.toBeDefined();
  });

  it("refuses to register without a commission quote when one is required", async () => {
    const { client, ethWallet, publicClient } = setup(true);
    const params = singleParams(ethWallet.account.address);
    delete params.quotedCommissionBps;

    await expect(client.registerPeginOnChain(params)).rejects.toThrow(
      /quotedCommissionBps is required/,
    );
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });

  it("refuses to register a batch without a commission quote when one is required", async () => {
    const { client, ethWallet, publicClient } = setup(true);
    const params = batchParams(ethWallet.account.address);
    delete params.quotedCommissionBps;

    await expect(client.registerPeginBatchOnChain(params)).rejects.toThrow(
      /quotedCommissionBps is required/,
    );
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });

  it("registers without a commission quote when none is required", async () => {
    const { client, ethWallet } = setup();
    const send = vi.spyOn(ethWallet, "sendTransaction");
    const params = singleParams(ethWallet.account.address);
    delete params.quotedCommissionBps;

    await client.registerPeginOnChain(params);

    const decoded = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: send.mock.calls[0][0].data!,
    });
    expect((decoded.args as readonly unknown[])[6]).toBe(125);
  });

  it("rejects an ETH account switch before submission", async () => {
    const { client } = setup();
    await expect(
      client.registerPeginOnChain(singleParams(OTHER_ACCOUNT)),
    ).rejects.toThrow(/Proof of possession/);
  });

  it("uses the single request snapshot after an RPC wait", async () => {
    const { client, ethWallet, publicClient } = setup(true);
    const params = singleParams(ethWallet.account.address);
    const lookup = defer<{ depositor: Address }>();
    publicClient.readContract.mockImplementationOnce(() => lookup.promise);
    const send = vi.spyOn(ethWallet, "sendTransaction");

    const registration = client.registerPeginOnChain(params);
    params.vaultProvider = OTHER_PROVIDER;
    params.hashlock = "0x01";
    params.depositorWotsPkHash = "0x01";
    params.htlcVout = 256;
    params.quotedCommissionBps = 500;
    lookup.resolve({ depositor: zeroAddress });

    await registration;
    const decoded = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: send.mock.calls[0][0].data!,
    });
    const args = decoded.args as readonly unknown[];
    expect((args[5] as string).toLowerCase()).toBe(REGISTRY);
    expect(args[6]).toBe(125);
    expect(args[7]).toBe(HASHLOCK);
    expect(args[8]).toBe(0);
    expect(args[10]).toBe(WOTS_PK_HASH);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getPegInFee",
        args: [REGISTRY],
      }),
    );
  });

  it("uses the batch request snapshot after an RPC wait", async () => {
    const { client, ethWallet, publicClient } = setup(true);
    const params = batchParams(ethWallet.account.address);
    const lookup = defer<{ depositor: Address }>();
    publicClient.readContract.mockImplementationOnce(() => lookup.promise);
    const send = vi.spyOn(ethWallet, "sendTransaction");

    const registration = client.registerPeginBatchOnChain(params);
    params.vaultProvider = OTHER_PROVIDER;
    params.quotedCommissionBps = 500;
    params.requests.length = 0;
    lookup.resolve({ depositor: zeroAddress });

    await registration;
    const transaction = send.mock.calls[0][0];
    const decoded = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: transaction.data!,
    });
    const args = decoded.args as readonly unknown[];
    expect((args[1] as string).toLowerCase()).toBe(REGISTRY);
    expect(args[2]).toBe(125);
    // These indexes are positional and TypeScript does not check them — `args`
    // is widened to `readonly unknown[]`. The fingerprint sits at 3 and pushed
    // `requests` to 4, so assert both: without the first line, a future
    // renumbering slip reads the wrong slot and stays green.
    expect(args[3]).toBe(FINGERPRINT);
    expect(args[4]).toHaveLength(1);
    expect(transaction.value).toBe(3n);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getPegInFee",
        args: [REGISTRY],
      }),
    );
  });

  it.each(["single", "batch"] as const)(
    "rejects the %s path when the pegin fee rose above the quote",
    async (path) => {
      const { client, ethWallet, publicClient } = setup();
      publicClient.readContract.mockImplementation(
        ({ functionName }: { functionName: string }) => {
          if (functionName === "getPegInFee") return Promise.resolve(4n);
          if (functionName === "getVaultProviderCommission")
            return Promise.resolve(100);
          return Promise.resolve({ depositor: zeroAddress as Address });
        },
      );
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(
        register(client, ethWallet.account.address, path),
      ).rejects.toThrow(/Pegin fee changed since quote/);
      expect(publicClient.estimateGas).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("sends the chain fee for every request in a batch when it is below the quote", async () => {
    const { client, ethWallet } = setup();
    const params = batchParams(ethWallet.account.address);
    params.requests.push({
      ...params.requests[0],
      depositorSignedPeginTx: signedPeginTransaction(0xac),
    });
    params.quotedPeginFeeWei = 7n;
    const send = vi.spyOn(ethWallet, "sendTransaction");

    await client.registerPeginBatchOnChain(params);

    expect(send.mock.calls[0][0].value).toBe(6n);
  });

  it("rejects a batch whose total pegin fee rose above the quote", async () => {
    const { client, ethWallet, publicClient } = setup();
    publicClient.readContract.mockImplementation(
      ({ functionName }: { functionName: string }) => {
        if (functionName === "getPegInFee") return Promise.resolve(4n);
        if (functionName === "getVaultProviderCommission")
          return Promise.resolve(100);
        return Promise.resolve({ depositor: zeroAddress as Address });
      },
    );
    const params = batchParams(ethWallet.account.address);
    params.requests.push({
      ...params.requests[0],
      depositorSignedPeginTx: signedPeginTransaction(0xac),
    });
    params.quotedPeginFeeWei = 7n;
    const send = vi.spyOn(ethWallet, "sendTransaction");

    await expect(client.registerPeginBatchOnChain(params)).rejects.toThrow(
      /Pegin fee changed since quote/,
    );
    expect(publicClient.estimateGas).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["single", "batch"] as const)(
    "rejects an account switch during a %s preflight before gas estimation",
    async (path) => {
      const { client, ethWallet, publicClient } = setup();
      const lookup = defer<{ depositor: Address }>();
      publicClient.readContract.mockImplementationOnce(() => lookup.promise);
      const send = vi.spyOn(ethWallet, "sendTransaction");

      const registration = register(client, ethWallet.account.address, path);
      ethWallet.updateConfig({ address: OTHER_ACCOUNT });
      lookup.resolve({ depositor: zeroAddress });

      await expect(registration).rejects.toThrow(/Proof of possession/);
      expect(publicClient.prepareTransactionRequest).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(["getBalance", "estimateGas", "prepareTransactionRequest"] as const)(
    "rejects an account switch during %s before submission",
    async (method) => {
      const { client, ethWallet, publicClient } = setup();
      const pending = defer<unknown>();
      publicClient[method].mockImplementationOnce(
        () => pending.promise as never,
      );
      const send = vi.spyOn(ethWallet, "sendTransaction");

      const registration = client.registerPeginOnChain(
        singleParams(ethWallet.account.address),
      );
      await vi.waitFor(() => {
        expect(publicClient[method]).toHaveBeenCalledTimes(1);
      });
      ethWallet.updateConfig({ address: OTHER_ACCOUNT });
      pending.resolve(
        method === "getBalance"
          ? 250_000n * 3n + 6n
          : method === "estimateGas"
            ? 250_000n
            : { type: "eip1559", maxFeePerGas: 3n, maxPriorityFeePerGas: 1n },
      );

      await expect(registration).rejects.toThrow(/Proof of possession/);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(["single", "batch"] as const)(
    "refuses a revoked depositor with an unchanged wallet snapshot on the %s path",
    async (path) => {
      const { client, ethWallet, getAddresses } = setup();
      const depositor = ethWallet.account.address;
      getAddresses.mockResolvedValueOnce([OTHER_ACCOUNT]);
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(register(client, depositor, path)).rejects.toThrow(
        /Ethereum wallet account is no longer available/,
      );
      expect(ethWallet.account.address).toBe(depositor);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    { addresses: [] },
    { addresses: ["not-an-address"] },
    { addresses: [REGISTRY, "not-an-address"] },
    { addresses: null },
  ])(
    "refuses an empty or invalid live account response before submission",
    async ({ addresses }) => {
      const { client, ethWallet, getAddresses } = setup();
      getAddresses.mockResolvedValueOnce(addresses as Address[]);
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(
        client.registerPeginOnChain(singleParams(ethWallet.account.address)),
      ).rejects.toThrow(/Ethereum wallet account is no longer available/);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("accepts the bound depositor as the second authorized account", async () => {
    const { client, ethWallet, getAddresses } = setup();
    getAddresses.mockResolvedValueOnce([
      OTHER_ACCOUNT,
      ethWallet.account.address,
    ]);
    const send = vi.spyOn(ethWallet, "sendTransaction");

    await client.registerPeginOnChain(singleParams(ethWallet.account.address));

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ account: ethWallet.account.address }),
    );
  });

  it("stops before submission when the live account read fails", async () => {
    const { client, ethWallet, getAddresses } = setup();
    const error = new Error("Ethereum account read failed");
    getAddresses.mockRejectedValueOnce(error);
    const send = vi.spyOn(ethWallet, "sendTransaction");

    await expect(
      client.registerPeginOnChain(singleParams(ethWallet.account.address)),
    ).rejects.toBe(error);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["single", "an existing vault", { depositor: OTHER_ACCOUNT }],
    ["batch", "an existing vault", { depositor: OTHER_ACCOUNT }],
    ["single", "an RPC rejection", new Error("vault lookup failed")],
    ["batch", "an RPC rejection", new Error("vault lookup failed")],
  ] as const)("stops the %s path after %s", async (path, _failure, result) => {
    const { client, ethWallet, publicClient } = setup();
    if (result instanceof Error) {
      publicClient.readContract.mockRejectedValueOnce(result);
    } else {
      publicClient.readContract.mockResolvedValueOnce(result);
    }
    const send = vi.spyOn(ethWallet, "sendTransaction");

    await expect(
      register(client, ethWallet.account.address, path),
    ).rejects.toThrow(
      result instanceof Error ? result.message : /Vault already exists/,
    );
    expect(publicClient.readContract).toHaveBeenCalledTimes(1);
    expect(publicClient.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "getPegInFee" }),
    );
    expect(publicClient.prepareTransactionRequest).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each(INVALID_SINGLE_PARAMS)(
    "rejects %s before all RPC and wallet calls",
    async (_name, invalid, expectedError) => {
      const { client, ethWallet, publicClient } = setup();
      const params = Object.assign(
        singleParams(ethWallet.account.address),
        invalid,
      );
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(client.registerPeginOnChain(params)).rejects.toThrow(
        expectedError,
      );
      expect(publicClient.readContract).not.toHaveBeenCalled();
      expect(publicClient.prepareTransactionRequest).not.toHaveBeenCalled();
      expect(publicClient.getCode).not.toHaveBeenCalled();
      expect(publicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );
});
