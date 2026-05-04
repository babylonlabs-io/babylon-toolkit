/**
 * Injects mock BTC (UniSat) and ETH (window.ethereum) wallet providers into
 * the page before load so the wallet-connector package detects them and offers
 * them as selectable options.  Tests that exercise wallet-dependent flows must
 * call injectWalletMocks() inside addInitScript before navigation.
 */

import type { Page } from "@playwright/test";

export const MOCK_BTC_ADDRESS =
  "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297";

export const MOCK_ETH_ADDRESS = "0x1234567890123456789012345678901234567890";

// Standard secp256k1 generator point — well-known, format-valid test value.
export const MOCK_BTC_PUBKEY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

export async function injectWalletMocks(page: Page): Promise<void> {
  await page.addInitScript(
    ({ btcAddress, ethAddress, btcPubkey }) => {
      // UniSat BTC wallet — the only enabled BTC wallet in the vault app.
      const mockUnisat = {
        getAccounts: async () => [btcAddress],
        requestAccounts: async () => [btcAddress],
        getPublicKey: async () => btcPubkey,
        signMessage: async (_msg: string, _type?: string) =>
          "mock_bip322_" + btcAddress,
        signPsbt: async (psbtHex: string, _opts?: unknown) => psbtHex,
        signPsbts: async (psbts: string[], _opts?: unknown) => [...psbts],
        getNetwork: async () => "livenet" as const,
        switchNetwork: async (_net: string) => {},
        on: (_event: string, _handler: unknown) => {},
        removeListener: (_event: string, _handler: unknown) => {},
        off: (_event: string, _handler: unknown) => {},
      };
      Object.defineProperty(window, "unisat", {
        value: mockUnisat,
        writable: false,
        configurable: true,
      });

      // EIP-1193 provider for ETH (AppKit's "Browser Wallet" connector).
      const mockEthereum = {
        isMetaMask: true,
        chainId: "0xaa36a7", // Sepolia
        selectedAddress: ethAddress,
        request: async ({
          method,
        }: {
          method: string;
          params?: unknown[];
        }) => {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [ethAddress];
            case "eth_chainId":
              return "0xaa36a7";
            case "net_version":
              return "11155111";
            case "personal_sign":
              return "0x" + "a".repeat(130);
            case "eth_signTypedData_v4":
              return "0x" + "b".repeat(130);
            case "eth_sendTransaction":
              return "0x" + "c".repeat(64);
            case "eth_estimateGas":
              return "0x5208";
            case "eth_gasPrice":
              return "0x3b9aca00";
            case "eth_getTransactionReceipt":
              return {
                status: "0x1",
                transactionHash: "0x" + "c".repeat(64),
                blockNumber: "0xf4240",
                blockHash: "0x" + "d".repeat(64),
                logs: [],
              };
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null;
            default:
              return null;
          }
        },
        on: (_event: string, _handler: unknown) => {},
        removeListener: (_event: string, _handler: unknown) => {},
        emit: (_event: string, ..._args: unknown[]) => {},
      };
      Object.defineProperty(window, "ethereum", {
        value: mockEthereum,
        writable: false,
        configurable: true,
      });
    },
    {
      btcAddress: MOCK_BTC_ADDRESS,
      ethAddress: MOCK_ETH_ADDRESS,
      btcPubkey: MOCK_BTC_PUBKEY,
    },
  );
}

/** Injects a wallet mock whose requestAccounts() rejects — simulates user
 *  cancelling the wallet connection prompt. */
export async function injectRejectingBtcWallet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockUnisat = {
      getAccounts: async () => [],
      requestAccounts: async () => {
        throw new Error("User rejected the request.");
      },
      getPublicKey: async () => {
        throw new Error("User rejected the request.");
      },
      signMessage: async () => {
        throw new Error("User rejected the request.");
      },
      signPsbt: async (psbt: string) => psbt,
      signPsbts: async (psbts: string[]) => [...psbts],
      getNetwork: async () => "livenet" as const,
      switchNetwork: async () => {},
      on: () => {},
      removeListener: () => {},
      off: () => {},
    };
    Object.defineProperty(window, "unisat", {
      value: mockUnisat,
      writable: false,
      configurable: true,
    });
  });
}
