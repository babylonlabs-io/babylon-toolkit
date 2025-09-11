import { useEffect, useMemo, useState } from "react";

import { getBabylonClient } from "@/infrastructure/babylon";
import { getUniqueIbcDenomsFromCoins } from "../utils/rewards";

type RewardCoin = { denom: string; amount: number };

/**
 * Hook that resolves base denom names for IBC denoms via the LCD.
 * Keeps graceful fallbacks and is side-effect isolated.
 */
export function useIbcDenomNames(params: {
    coins: RewardCoin[] | undefined;
}): Record<string, string> {
    const { coins } = params;
    const [ibcDenomNames, setIbcDenomNames] = useState<Record<string, string>>({});

    const ibcDenoms = useMemo(
        () => getUniqueIbcDenomsFromCoins(coins ?? []),
        [coins],
    );

    useEffect(() => {
        if (!ibcDenoms.length) return;
        let cancelled = false;
        (async () => {
            try {
                const client = await getBabylonClient();
                const entries = await Promise.all(
                    ibcDenoms.map(async (denom) => {
                        try {
                            const base = await (client.btc as any).getIbcDenomBase(denom);
                            return [denom, base ?? denom] as const;
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
    }, [ibcDenoms]);

    return ibcDenomNames;
}
