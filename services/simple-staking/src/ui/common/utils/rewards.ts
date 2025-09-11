import { ubbnToBaby } from "@/ui/common/utils/bbn";

export type RewardCoin = { denom: string; amount: number };

/**
 * Extract a unique list of IBC denoms (ibc/<hash>) from reward coins.
 */
export function getUniqueIbcDenomsFromCoins(coins: RewardCoin[]): string[] {
  return Array.from(
    new Set(
      (coins ?? [])
        .map((c) => c?.denom)
        .filter(
          (d): d is string => typeof d === "string" && d.startsWith("ibc/"),
        ),
    ),
  );
}

/**
 * Map reward coins to UI items using provided config.
 * Pure function; does not perform any I/O.
 */
export function mapRewardCoinsToItems(params: {
  coins: RewardCoin[];
  ibcDenomNames: Record<string, string>;
  bbnNetworkName: string;
  bbnCoinSymbol: string;
  babyIcon: string;
}): Array<{
  amount: string;
  currencyIcon?: string;
  chainName: string;
  currencyName: string;
  placeholder: string;
  displayBalance: boolean;
  balanceDetails: {
    balance: string;
    symbol: string;
    price: number;
    displayUSD: boolean;
    decimals: number;
  };
}> {
  const { coins, ibcDenomNames, bbnNetworkName, bbnCoinSymbol, babyIcon } =
    params;

  return (coins ?? []).map(({ denom, amount }) => {
    if (denom === "ubbn") {
      const amt = ubbnToBaby(amount).toString();
      return {
        amount: amt,
        currencyIcon: babyIcon,
        chainName: bbnNetworkName,
        currencyName: bbnCoinSymbol,
        placeholder: "0",
        displayBalance: true,
        balanceDetails: {
          balance: amt,
          symbol: bbnCoinSymbol,
          price: 0,
          displayUSD: false,
          decimals: 6,
        },
      };
    }

    if (denom.startsWith("factory/")) {
      const parts = denom.split("/");
      const subdenom = parts[parts.length - 1] || denom;
      return {
        amount: String(amount),
        currencyIcon: undefined,
        chainName: bbnNetworkName,
        currencyName: subdenom,
        placeholder: "0",
        displayBalance: true,
        balanceDetails: {
          balance: String(amount),
          symbol: subdenom,
          price: 0,
          displayUSD: false,
          decimals: 0,
        },
      };
    }

    if (denom.startsWith("ibc/")) {
      const resolved = ibcDenomNames[denom];
      const symbol = resolved ?? denom;
      return {
        amount: String(amount),
        currencyIcon: undefined,
        chainName: bbnNetworkName,
        currencyName: symbol,
        placeholder: "0",
        displayBalance: true,
        balanceDetails: {
          balance: String(amount),
          symbol,
          price: 0,
          displayUSD: false,
          decimals: 0,
        },
      };
    }

    const symbol = denom;
    return {
      amount: String(amount),
      currencyIcon: undefined,
      chainName: bbnNetworkName,
      currencyName: symbol,
      placeholder: "0",
      displayBalance: true,
      balanceDetails: {
        balance: String(amount),
        symbol,
        price: 0,
        displayUSD: false,
        decimals: 0,
      },
    };
  });
}
