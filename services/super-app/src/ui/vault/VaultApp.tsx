import { Router } from "@services/vault/ui/router";
import Providers from "@services/vault/ui/common/providers";

export const VaultApp = () => {
    return (
        <Providers>
            <Router />
        </Providers>
    );
};

