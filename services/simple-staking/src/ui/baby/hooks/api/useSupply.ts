import babylon from "@/infrastructure/babylon";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";
import { ONE_DAY } from "@/ui/common/constants";

const BABY_SUPPLY_KEY = "BABY_SUPPLY_KEY";

export function useSupply({ enabled = true }: { enabled?: boolean } = {}) {
  return useClientQuery({
    queryKey: [BABY_SUPPLY_KEY],
    queryFn: async () => {
      const client = await babylon.client();
      return client.baby.getSupply("ubbn");
    },
    enabled,
    staleTime: ONE_DAY, // Token supply changes very rarely
  });
}
