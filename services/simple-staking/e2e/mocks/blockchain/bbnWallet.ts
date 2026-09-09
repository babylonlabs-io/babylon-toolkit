import type { Page } from "@playwright/test";
import {
  DirectSecp256k1Wallet,
  type DirectSignResponse,
} from "@cosmjs/proto-signing";
import type { SerializedSignDoc } from "../../types";
import type { TestWalletOptions } from "./btcWallet";

import mockData, { type MockData } from "./constants";
import type { BBNWalletType } from "./types";
import { verifyBBNWalletInjected } from "./verification";

type DataType = {
  walletType: BBNWalletType;
  mockData: MockData;
  localSigner: boolean;
};

export const injectBBNWallet = async (
  page: Page,
  walletType: BBNWalletType = "Leap",
  { data = mockData, privateKeyHex }: TestWalletOptions = {},
) => {
  if (privateKeyHex) {
    const signer = await DirectSecp256k1Wallet.fromKey(
      Buffer.from(privateKeyHex, "hex"),
      "bbn",
    );
    const [account] = await signer.getAccounts();
    data = {
      ...data,
      bbnWallet: {
        ...data.bbnWallet,
        walletAddress: account.address,
        pubkeyArray: Array.from(account.pubkey),
      },
    };
    await page.exposeFunction(
      "e2eSignDirect",
      async (address: string, doc: SerializedSignDoc) => {
        const result = await signer.signDirect(address, {
          ...doc,
          bodyBytes: Uint8Array.from(doc.bodyBytes),
          authInfoBytes: Uint8Array.from(doc.authInfoBytes),
          accountNumber: BigInt(doc.accountNumber),
        });
        return {
          ...result,
          signed: {
            ...result.signed,
            bodyBytes: Array.from(result.signed.bodyBytes),
            authInfoBytes: Array.from(result.signed.authInfoBytes),
            accountNumber: result.signed.accountNumber.toString(),
          },
        };
      },
    );
  }
  try {
    await page.evaluate(
      (data: DataType) => {
        const { walletType, mockData, localSigner } = data;
        const bbnData = mockData.bbnWallet;

        const bbnWallet = {
          connectWallet: () => {
            bbnWallet.isConnected = true;
            return bbnWallet;
          },
          isConnected: false,
          getWalletProviderName: () => walletType,
          getOfflineSigner: () => ({
            getAccounts: async () => [
              {
                address: bbnData.walletAddress,
                algo: "secp256k1",
                pubkey: new Uint8Array(bbnData.pubkeyArray),
              },
            ],
            signDirect: async (
              address: string,
              doc: DirectSignResponse["signed"],
            ): Promise<DirectSignResponse> => {
              if (localSigner) {
                const result = await window.e2eSignDirect(address, {
                  ...doc,
                  bodyBytes: Array.from(doc.bodyBytes),
                  authInfoBytes: Array.from(doc.authInfoBytes),
                  accountNumber: doc.accountNumber.toString(),
                });
                return {
                  ...result,
                  signed: {
                    ...result.signed,
                    bodyBytes: Uint8Array.from(result.signed.bodyBytes),
                    authInfoBytes: Uint8Array.from(result.signed.authInfoBytes),
                    accountNumber: BigInt(result.signed.accountNumber),
                  },
                };
              }
              throw new Error("No test signer configured");
            },
          }),
          getOfflineSignerAuto: async () => bbnWallet.getOfflineSigner(),
          getAddress: async () => bbnData.walletAddress,
          on: (event: string, callback: Function) => {
            return () => {};
          },
          off: (event: string, callback: Function) => {},
        };

        window.bbnwallet = bbnWallet;

        if (walletType === "Keplr") {
          // @ts-ignore - keplr is defined in the window for the test
          (window as any).keplr = {
            enable: async (chainId: string) => {
              return true;
            },
            getOfflineSigner: () => bbnWallet.getOfflineSigner(),
            getKey: async (chainId: string) => {
              return {
                name: bbnData.walletNames.keplr,
                algo: "secp256k1",
                pubKey: new Uint8Array(bbnData.pubkeyArray),
                address: new Uint8Array(bbnData.pubkeyArray),
                bech32Address: bbnData.walletAddress,
              };
            },
            signDirect: bbnWallet.getOfflineSigner().signDirect,
          };
        } else if (walletType === "Leap") {
          // @ts-ignore - leap is defined in the window for the test
          window.leap = {
            enable: async (chainId: string) => {
              return true;
            },
            getOfflineSigner: () => bbnWallet.getOfflineSigner(),
            getKey: async (chainId: string) => {
              return {
                name: bbnData.walletNames.leap,
                algo: "secp256k1",
                pubKey: new Uint8Array(bbnData.pubkeyArray),
                address: new Uint8Array(bbnData.pubkeyArray),
                bech32Address: bbnData.walletAddress,
              };
            },
          };
        } else if (walletType === "Cosmostation") {
          // @ts-ignore - cosmostation is defined in the window for the test
          window.cosmostation = {
            providers: {
              keplr: {
                enable: async (chainId: string) => {
                  return true;
                },
                getOfflineSigner: () => bbnWallet.getOfflineSigner(),
              },
            },
          };
        }
      },
      { walletType, mockData: data, localSigner: Boolean(privateKeyHex) },
    );

    // Verify BBN wallet was properly injected
    const isBBNInjected = await verifyBBNWalletInjected(page);
    if (!isBBNInjected) {
      throw new Error("BBN wallet was not properly injected");
    }
  } catch (error) {
    throw error;
  }
};
