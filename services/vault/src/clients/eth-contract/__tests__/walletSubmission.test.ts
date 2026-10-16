/**
 * Runs viem's real `sendTransaction` over a fake wallet provider, since the
 * resend this guards against happens inside viem, not in app code.
 */

import { createWalletClient, custom, type WalletClient } from "viem";
import { sepolia } from "viem/chains";
import { describe, expect, it } from "vitest";

import { singleSubmissionWalletClient } from "../walletSubmission";

const ACCOUNT = "0xabcdef0000000000000000000000000000000002";
const TO = "0x2222222222222222222222222222222222222222";
const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/** A wallet over a fake provider that records every submission it takes. */
function walletWith(answers: {
  eth_sendTransaction: () => Promise<unknown>;
  wallet_sendTransaction: () => Promise<unknown>;
}): { walletClient: WalletClient; submissions: string[] } {
  const submissions: string[] = [];
  const walletClient = createWalletClient({
    account: ACCOUNT,
    chain: sepolia,
    transport: custom(
      {
        async request({ method }: { method: string }) {
          if (method === "eth_chainId") return SEPOLIA_CHAIN_ID_HEX;
          if (
            method === "eth_sendTransaction" ||
            method === "wallet_sendTransaction"
          ) {
            submissions.push(method);
            return answers[method]();
          }
          throw new Error(`unexpected ${method}`);
        },
      },
      { retryCount: 0 },
    ),
  });
  return { walletClient, submissions };
}

function send(walletClient: WalletClient) {
  return walletClient.sendTransaction({
    to: TO,
    data: "0x1234",
    chain: sepolia,
    account: walletClient.account!,
  });
}

describe("singleSubmissionWalletClient", () => {
  it("keeps viem from sending again as wallet_sendTransaction after the wallet refused with -32000", async () => {
    const { walletClient, submissions } = walletWith({
      eth_sendTransaction: async () => {
        throw Object.assign(
          new Error("nonce too low: next nonce 789, tx nonce 788"),
          { code: -32000 },
        );
      },
      wallet_sendTransaction: async () => HASH,
    });

    await expect(
      send(singleSubmissionWalletClient(walletClient)),
    ).rejects.toThrow(/nonce too low: next nonce 789, tx nonce 788/);
    expect(submissions).toEqual(["eth_sendTransaction"]);
  });

  it("lets viem use wallet_sendTransaction when the wallet does not serve eth_sendTransaction", async () => {
    const { walletClient, submissions } = walletWith({
      eth_sendTransaction: async () => {
        throw Object.assign(new Error("Method not found"), { code: -32601 });
      },
      wallet_sendTransaction: async () => HASH,
    });

    await expect(
      send(singleSubmissionWalletClient(walletClient)),
    ).resolves.toBe(HASH);
    expect(submissions).toEqual([
      "eth_sendTransaction",
      "wallet_sendTransaction",
    ]);
  });

  it("takes one submission per client, so a second send needs a new one", async () => {
    const { walletClient, submissions } = walletWith({
      eth_sendTransaction: async () => HASH,
      wallet_sendTransaction: async () => HASH,
    });
    const client = singleSubmissionWalletClient(walletClient);

    await expect(send(client)).resolves.toBe(HASH);
    await expect(send(client)).rejects.toThrow(
      /Refused a second transaction submission/,
    );
    expect(submissions).toEqual(["eth_sendTransaction"]);
  });
});
