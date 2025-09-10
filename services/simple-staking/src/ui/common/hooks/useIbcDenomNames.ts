import { useEffect, useMemo, useState } from "react";

import { getUniqueIbcDenomsFromCoins } from "../utils/rewards";

type RewardCoin = { denom: string; amount: number };

/**
 * Hook that resolves base denom names for IBC denoms via the LCD.
 * Keeps graceful fallbacks and is side-effect isolated.
 */
export function useIbcDenomNames(params: {
    coins: RewardCoin[] | undefined;
    lcdUrl: string;
}): Record<string, string> {
    const { coins, lcdUrl } = params;
    const [ibcDenomNames, setIbcDenomNames] = useState<Record<string, string>>(
        {},
    );

    const ibcDenoms = useMemo(
        () => getUniqueIbcDenomsFromCoins(coins ?? []),
        [coins],
    );

    useEffect(() => {
        if (!ibcDenoms.length) return;
        let cancelled = false;
        (async () => {
            try {
                const entries = await Promise.all(
                    ibcDenoms.map(async (denom) => {
                        try {
                            const baseRoot = lcdUrl.replace(/\/?$/, "");
                            const hash = denom.slice(4);
                            const candidates = [
                                // Standard path with just the hash
                                `${baseRoot}/ibc/apps/transfer/v1/denoms/${encodeURIComponent(hash)}`,
                                // Some LCDs expose it under '/denom_traces/ibc/{hash}'
                                `${baseRoot}/ibc/apps/transfer/v1/denoms/ibc/${encodeURIComponent(hash)}`,
                            ];
                            for (const url of candidates) {
                                try {
                                    const res = await fetch(url);
                                    if (!res.ok) {
                                        console.log(
                                            "[RewardsFlow] Arrow: IBC token -> denom_traces LCD not available",
                                            { url, status: res.status },
                                        );
                                        continue;
                                    }
                                    const data: any = await res.json();
                                    const base: string | undefined =
                                        data?.denom?.base;
                                    if (base) return [denom, base] as const;
                                } catch {
                                    // try next candidate
                                }
                            }
                            return [denom, denom] as const;
                        } catch {
                            return [denom, denom] as const;
                        }
                    }),
                );
                if (!cancelled) {
                    const map: Record<string, string> = {};
                    for (const [k, v] of entries) map[k] = v;
                    setIbcDenomNames(map);
                }
            } catch {
                // noop
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [ibcDenoms, lcdUrl]);

    return ibcDenomNames;
}
