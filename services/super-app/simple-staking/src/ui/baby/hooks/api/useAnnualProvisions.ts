import babylon from "@/infrastructure/babylon";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";
import { ONE_DAY } from "@/ui/common/constants";

const BABY_ANNUAL_PROVISIONS_KEY = "BABY_ANNUAL_PROVISIONS_KEY";

export function useAnnualProvisions({
  enabled = true,
}: { enabled?: boolean } = {}) {
  return useClientQuery({
    queryKey: [BABY_ANNUAL_PROVISIONS_KEY],
    queryFn: async () => {
      const client = await babylon.client();
      try {
        const annual = await client.baby.getAnnualProvisions();
        return annual;
      } catch (error) {
        console.error("[useAnnualProvisions] Failed:", error);
        return 0;
      }
    },
    enabled,
    staleTime: ONE_DAY, // Annual provisions change very rarely
  });
}
