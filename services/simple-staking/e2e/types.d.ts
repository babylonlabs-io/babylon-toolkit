import type { DirectSignResponse } from "@cosmjs/proto-signing";

export interface SerializedSignDoc {
  bodyBytes: number[];
  authInfoBytes: number[];
  chainId: string;
  accountNumber: string;
}

declare global {
  interface Window {
    e2eSignDirect: (
      address: string,
      doc: SerializedSignDoc,
    ) => Promise<{
      signed: SerializedSignDoc;
      signature: DirectSignResponse["signature"];
    }>;
    e2eSignPsbt: (hex: string) => Promise<string>;
    e2eSignMessage: (message: string, type: string) => Promise<string>;
    // From balanceAddress.spec.ts
    mockCosmJSBankBalance: (
      address: string,
    ) => Promise<{ amount: string; denom: string }>;
    mockCosmJSRewardsQuery: (address: string) => Promise<{
      rewardGauges: {
        [key: string]: {
          coins: Array<{ amount: string; denom: string }>;
          withdrawnCoins: Array<{ amount: string; denom: string }>;
        };
      };
    }>;

    require: any;
    __e2eTestMode: boolean;
    __mockVerifyBTCAddress: () => Promise<boolean>;

    btcwallet: {
      connectWallet: () => any;
      getWalletProviderName: () => string;
      getAddress: () => string;
      getPublicKeyHex: () => string;
      on: (...args: any[]) => any;
      off?: (event: string, callback: Function) => void;
      getNetwork: () => string;
      getBTCTipHeight: () => number;
      getNetworkFees: () => {
        fastestFee: number;
        halfHourFee: number;
        hourFee: number;
        economyFee: number;
        minimumFee: number;
      };
      getInscriptions: () => any[];
      signPsbt: (psbtHex: string) => string | Promise<string>;
      pushTx: (txHex: string) => string;
      isConnected?: boolean;
    };

    bbnwallet: {
      connectWallet: () => any;
      getWalletProviderName: () => string;
      getOfflineSigner: () => any;
    };

    unisat?: any;
    $onekey?: any;
  }
}

export {};
