import { Router } from "@services/simple-staking/ui/router";
import Providers from "@services/simple-staking/ui/common/providers";

export const StakingApp = () => {
    return (
        <Providers>
            <Router />
        </Providers>
    );
};

