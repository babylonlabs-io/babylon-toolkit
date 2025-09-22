import babylon from "@/infrastructure/babylon";
import { useClientQuery } from "@/ui/common/hooks/client/useClient";

const BABY_SUPPLY_KEY = "BABY_SUPPLY_KEY";

export function useSupply({ enabled = true }: { enabled?: boolean } = {}) {
    return useClientQuery({
        queryKey: [BABY_SUPPLY_KEY],
        queryFn: async () => {
            const client = await babylon.client();
            return client.baby.getSupply("ubbn");
        },
        enabled,
    });
}
