import babylon from "@/infrastructure/babylon";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";

const BABY_INFLATION_KEY = "BABY_INFLATION_KEY";

export function useInflation({ enabled = true }: { enabled?: boolean } = {}) {
  return useClientQuery({
    queryKey: [BABY_INFLATION_KEY],
    queryFn: async () => {
      const client = await babylon.client();
      return client.baby.getInflation();
    },
    enabled,
  });
}
