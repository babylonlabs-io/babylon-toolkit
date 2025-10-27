import type { Coin } from "@cosmjs/stargate";

export function sumCoinAmounts(coins?: Coin[] | null): number {
  const sum = coins?.reduce(
    (acc: number, coin: Coin) => acc + Number(coin.amount),
    0,
  );
  return sum || 0;
}
