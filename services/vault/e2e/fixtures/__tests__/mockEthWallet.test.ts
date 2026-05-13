import { describe, expect, it } from "vitest";

import { createMockEthWallet } from "../mockEthWallet";

describe("createMockEthWallet defaults", () => {
  it("derives a deterministic address from the default private key", () => {
    const { account } = createMockEthWallet();
    expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Second call with same defaults must yield the same address
    const second = createMockEthWallet();
    expect(second.account.address).toBe(account.address);
  });

  it("returns the configured chainId via the transport", async () => {
    const { walletClient } = createMockEthWallet({ chainIdHex: "0x539" });
    const result = (await walletClient.request({
      method: "eth_chainId",
    })) as string;
    expect(result).toBe("0x539");
  });

  it("returns the wallet account address from getAddresses", async () => {
    const { walletClient, account } = createMockEthWallet();
    const addrs = await walletClient.getAddresses();
    expect(addrs[0].toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("differs when the private key is overridden", () => {
    const a = createMockEthWallet();
    const b = createMockEthWallet({
      privateKey: `0x${"11".repeat(32)}`,
    });
    expect(a.account.address).not.toBe(b.account.address);
  });
});

describe("MockEthScript", () => {
  it("returnNext overrides the chainId for the next call", async () => {
    const { walletClient, script } = createMockEthWallet();
    script.returnNext("eth_chainId", "0x1");
    expect(await walletClient.request({ method: "eth_chainId" })).toBe("0x1");
    expect(await walletClient.request({ method: "eth_chainId" })).toBe(
      "0xaa36a7",
    );
  });

  it("rejectNext makes the next matching call throw", async () => {
    const { walletClient, script } = createMockEthWallet();
    script.rejectNext("eth_chainId", new Error("rpc down"));
    await expect(
      walletClient.request({ method: "eth_chainId" }),
    ).rejects.toThrow("rpc down");
    await expect(walletClient.request({ method: "eth_chainId" })).resolves.toBe(
      "0xaa36a7",
    );
  });

  it("revertNextTransaction makes both send paths reject with the configured reason", async () => {
    const { walletClient, script } = createMockEthWallet();
    script.revertNextTransaction("custom revert");
    await expect(
      walletClient.request({
        method: "eth_sendTransaction",
        params: [{}] as never,
      }),
    ).rejects.toThrow("custom revert");
    await expect(
      walletClient.request({
        method: "eth_sendRawTransaction",
        params: ["0x"],
      }),
    ).rejects.toThrow("custom revert");
  });

  it("callCount tracks chainId calls across invocations", async () => {
    const { walletClient, script } = createMockEthWallet();
    expect(script.callCount("eth_chainId")).toBe(0);
    await walletClient.request({ method: "eth_chainId" });
    await walletClient.request({ method: "eth_chainId" });
    expect(script.callCount("eth_chainId")).toBe(2);
  });

  it("clear discards queued overrides", async () => {
    const { walletClient, script } = createMockEthWallet();
    script.returnNext("eth_chainId", "0x539");
    script.clear();
    expect(await walletClient.request({ method: "eth_chainId" })).toBe(
      "0xaa36a7",
    );
  });
});
