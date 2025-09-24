import babylon from "@/infrastructure/babylon";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";

const BABY_ANNUAL_PROVISIONS_KEY = "BABY_ANNUAL_PROVISIONS_KEY";

export function useAnnualProvisions({ enabled = true }: { enabled?: boolean } = {}) {
    return useClientQuery({
        queryKey: [BABY_ANNUAL_PROVISIONS_KEY],
        queryFn: async () => {
            const client = await babylon.client();
            try {
                const annual = await client.baby.getAnnualProvisions();
                if (annual && Number.isFinite(annual) && annual > 0) {
                    return annual;
                }
            } catch (error) {
                console.error("[useAnnualProvisions] New method failed:", error);
            }

            try {
                const [inflation, supply] = await Promise.all([
                    client.baby.getInflation(),
                    client.baby.getSupply()
                ]);
                const derived = Number(inflation) * Number(supply);
                return Number.isFinite(derived) ? derived : 0;
            } catch (error) {
                console.error("[useAnnualProvisions] Fallback failed:", error);
                return 0;
            }
        },
        enabled,
    });
}


