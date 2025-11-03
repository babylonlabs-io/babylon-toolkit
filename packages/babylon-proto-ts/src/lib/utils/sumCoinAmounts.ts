import type { Coin } from "@cosmjs/stargate";

export function sumCoinAmounts(coins?: Coin[] | null): bigint {
  const sum = coins?.reduce(
    (acc: bigint, coin: Coin) => acc + BigInt(coin.amount),
    0n,
  );
  return sum || 0n;
}
