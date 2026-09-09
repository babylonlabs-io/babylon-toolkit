import type { Page } from "@playwright/test";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, networks, payments, Psbt } from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";

import { signBip322P2wpkhWitness } from "../../../../../packages/babylon-ts-sdk/src/testing/signBip322P2wpkhWitness";

import mockData, { type MockData } from "./constants";
import type { BTCWalletType } from "./types";
import { verifyBTCWalletInjected } from "./verification";

export interface TestWalletOptions {
  data?: MockData;
  privateKeyHex?: string;
}

type DataType = {
  walletType: BTCWalletType;
  mockData: MockData;
  localSigner: boolean;
};

export const injectBTCWallet = async (
  page: Page,
  walletType: BTCWalletType = "OKX",
  { data = mockData, privateKeyHex }: TestWalletOptions = {},
) => {
  if (privateKeyHex) {
    initEccLib(ecc);
    const key = ECPairFactory(ecc).fromPrivateKey(
      Buffer.from(privateKeyHex, "hex"),
    );
    data = {
      ...data,
      btcWallet: {
        ...data.btcWallet,
        publicKeyHex: key.publicKey.toString("hex"),
        mainnetAddress: payments.p2wpkh({ pubkey: key.publicKey }).address!,
        testnetAddress: payments.p2wpkh({
          pubkey: key.publicKey,
          network: networks.testnet,
        }).address!,
      },
    };
    await page.exposeFunction("e2eSignPsbt", (hex: string) => {
      const psbt = Psbt.fromHex(hex).signAllInputs(key);
      if (
        !psbt.validateSignaturesOfAllInputs((pubkey, hash, signature) =>
          signature.length === 64 && pubkey.length === 32
            ? ecc.verifySchnorr(hash, pubkey, signature)
            : ecc.verify(hash, pubkey, signature),
        )
      ) {
        throw new Error("Invalid local test signature");
      }
      return psbt.finalizeAllInputs().toHex();
    });
    await page.exposeFunction(
      "e2eSignMessage",
      (message: string, type: string) => {
        if (type !== "bip322-simple")
          throw new Error("Unsupported test signature type");
        return Buffer.from(
          signBip322P2wpkhWitness(
            new TextEncoder().encode(message),
            key.privateKey!,
          ),
        ).toString("base64");
      },
    );
  }
  try {
    await page.evaluate(
      (data: DataType) => {
        const { walletType, mockData, localSigner } = data;
        const btcData = mockData.btcWallet;

        const btcWallet = {
          connectWallet: () => {
            btcWallet.isConnected = true;
            return btcWallet;
          },
          isConnected: false,
          getWalletProviderName: () => walletType,
          getAddress: () => btcData.mainnetAddress,
          getPublicKeyHex: () => btcData.publicKeyHex,
          on: (event: string, callback: Function) => {
            return () => {};
          },
          off: (event: string, callback: Function) => {},
          getNetwork: () => "mainnet",
          getBTCTipHeight: () => btcData.tipHeight,
          getNetworkFees: () => btcData.networkFees,
          getInscriptions: () => [],
          signPsbt: (_psbtHex: string) => {
            if (!localSigner) throw new Error("No test signer configured");
            return window.e2eSignPsbt(_psbtHex);
          },
          ...(localSigner
            ? {
                signMessage: (message: string, type: string) =>
                  window.e2eSignMessage(message, type),
              }
            : {}),
          pushTx: (_txHex: string) => {
            return btcData.txHash;
          },
        };

        window.btcwallet = btcWallet;

        const walletStrategies: Record<string, () => void> = {
          OKX: () => {
            (window as any).okxwallet = {
              bitcoin: {
                ...btcWallet,
                isOKXWallet: true,
                getNetwork: () => "mainnet",
                getPublicKey: () => btcData.publicKeyHex,
                getBalance: () => btcData.balance,
                getAccounts: () => [btcData.mainnetAddress],
                isAccountActive: () => true,
                switchNetwork: (network: string) => Promise.resolve(true),
                connect: async () => {
                  return {
                    address: btcData.mainnetAddress,
                    compressedPublicKey: btcData.publicKeyHex,
                  };
                },
                getSelectedAddress: () => {
                  return btcData.mainnetAddress;
                },
                getKey: () => ({
                  publicKey: btcData.publicKeyHex,
                  address: btcData.mainnetAddress,
                }),
              },

              bitcoinTestnet: {
                ...btcWallet,
                isOKXWallet: true,
                getNetwork: () => "testnet",
                getPublicKey: () => btcData.publicKeyHex,
                getBalance: () => btcData.balance,
                getAccounts: () => [btcData.testnetAddress],
                connect: async () => {
                  return {
                    address: btcData.testnetAddress,
                    compressedPublicKey: btcData.publicKeyHex,
                  };
                },
                getSelectedAddress: () => {
                  return btcData.testnetAddress;
                },
              },

              bitcoinSignet: {
                ...btcWallet,
                isOKXWallet: true,
                getNetwork: () => "signet",
                getPublicKey: () => btcData.publicKeyHex,
                getBalance: () => btcData.balance,
                getAccounts: () => [btcData.testnetAddress],
                connect: async () => {
                  return {
                    address: btcData.testnetAddress,
                    compressedPublicKey: btcData.publicKeyHex,
                  };
                },
                getSelectedAddress: () => {
                  return btcData.testnetAddress;
                },
              },

              enable: async (chain = "BTC") => {
                if (
                  chain === "BTC" ||
                  chain === "Bitcoin" ||
                  chain === "bitcoin"
                ) {
                  return [btcData.mainnetAddress];
                }
                throw new Error(`Chain not supported: ${chain}`);
              },
              request: async (params: { method: string; params?: unknown }) => {
                const { method, params: methodParams } = params;

                switch (method) {
                  case "btc_getAccounts":
                  case "btc_accounts":
                    return [btcData.mainnetAddress];
                  case "btc_getNetwork":
                  case "btc_networkVersion":
                  case "wallet_getNetwork":
                    return "signet";
                  case "wallet_switchBitcoinNetwork":
                    return true;
                  case "btc_getBalance":
                    return btcData.balance;
                  case "btc_signPsbt":
                    if (
                      typeof methodParams !== "object" ||
                      methodParams === null ||
                      !("psbt" in methodParams) ||
                      typeof methodParams.psbt !== "string"
                    )
                      throw new Error("Invalid test signing request");
                    return btcWallet.signPsbt(methodParams.psbt);
                  default:
                    return null;
                }
              },
              isConnected: () => true,
              supportedChains: ["BTC", "bitcoin", "Bitcoin"],
              hasChain: (chain: string) =>
                ["BTC", "bitcoin", "Bitcoin"].includes(chain),
              on: (event: string, handler: Function) => {},
              off: (event: string, handler: Function) => {},
              isOKXWallet: true,
              version: "1.0.0",
            };
          },
          Unisat: () => {
            // @ts-ignore - unisat is defined in the window for the test
            window.unisat = {
              ...btcWallet,
              isUnisatWallet: true,
            };
          },
          OneKey: () => {
            window.$onekey = {
              bitcoin: {
                ...btcWallet,
                isOneKey: true,
              },
            };
          },
        };

        // Execute the appropriate strategy
        const strategy = walletStrategies[walletType];
        if (strategy) {
          strategy();
        }
      },
      { walletType, mockData: data, localSigner: Boolean(privateKeyHex) },
    );

    const isInjected = await verifyBTCWalletInjected(page);
    if (!isInjected) {
      throw new Error("BTC wallet was not properly injected");
    }
  } catch (error) {
    throw error;
  }
};
