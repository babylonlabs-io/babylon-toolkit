// Types for the mock data
export interface BBNWallet {
  walletAddress: string;
  pubkeyArray: number[];
  walletNames: {
    keplr: string;
    leap: string;
  };
}

export interface BTCWallet {
  mainnetAddress: string;
  testnetAddress: string;
  publicKeyHex: string;
  txHash: string;
  balance: {
    confirmed: number;
    unconfirmed: number;
    total: number;
  };
  networkFees: {
    fastestFee: number;
    halfHourFee: number;
    hourFee: number;
    economyFee: number;
    minimumFee: number;
  };
  tipHeight: number;
}

export interface BBNQueries {
  rewardAmount: string;
  bbnBalance: string;
  stakedBtc: string;
  stakableBtc: string;
  mockDelegation: {
    finality_provider_btc_pks_hex: string[];
    params_version: number;
    staker_btc_pk_hex: string;
    delegation_staking: {
      staking_tx_hex: string;
      staking_tx_hash_hex: string;
      staking_timelock: number;
      staking_amount: number;
    };
    state: string;
  };
  networkInfo: {
    covenant_pks: string[];
    covenant_quorum: number;
    min_staking_value_sat: number;
    max_staking_value_sat: number;
  };
}

export interface MockData {
  bbnWallet: BBNWallet;
  btcWallet: BTCWallet;
  bbnQueries: BBNQueries;
}

// Mock data constants
const mockData: MockData = {
  bbnWallet: {
    walletAddress: "bbn1qpzxvj2vty4smkhkn4fjkvst0kv8zgxjumz4u0",
    pubkeyArray: [1, 2, 3, 4, 5],
    walletNames: {
      keplr: "mock-keplr",
      leap: "mock-leap",
    },
  },
  btcWallet: {
    mainnetAddress:
      "bc1p8gjpy0vyfdq3tty8sy0v86dvl69rquc85n2gpuztll9wxh9cpars7r97sd",
    testnetAddress:
      "tb1p8gjpy0vyfdq3tty8sy0v86dvl69rquc85n2gpuztll9wxh9cparslrnj4m",
    publicKeyHex:
      "024c6e2954c75bcb53aa13b7cd5d8bcdb4c9a4dd0784d68b115bd4408813b45608",
    txHash: "47af61d63bcc6c513561d9a1198d082052cc07a81f50c6f130653f0a6ecc0fc1",
    balance: {
      confirmed: 12345678,
      unconfirmed: 0,
      total: 12345678,
    },
    networkFees: {
      fastestFee: 1,
      halfHourFee: 1,
      hourFee: 1,
      economyFee: 1,
      minimumFee: 1,
    },
    tipHeight: 859568,
  },
  bbnQueries: {
    rewardAmount: "500000",
    bbnBalance: "1000000",
    stakedBtc: "9876543",
    stakableBtc: "74175",
    mockDelegation: {
      finality_provider_btc_pks_hex: [
        "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      ],
      params_version: 0,
      staker_btc_pk_hex:
        "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
      delegation_staking: {
        staking_tx_hex: "00",
        staking_tx_hash_hex: "hash",
        staking_timelock: 0,
        staking_amount: 9876543,
      },
      state: "ACTIVE",
    },
    networkInfo: {
      covenant_pks: [
        "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
        "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
        "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
      ],
      covenant_quorum: 2,
      min_staking_value_sat: 100000,
      max_staking_value_sat: 1000000,
    },
  },
};

export default mockData;
