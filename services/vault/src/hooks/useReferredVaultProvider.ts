import { useSyncExternalStore } from "react";

import {
  getReferredVaultProvider,
  subscribeReferredVaultProvider,
} from "@/storage/referredVaultProviderStorage";

/**
 * The lowercase address of the vault provider a link referred this visitor
 * to, or null when there is none or it has expired.
 */
export function useReferredVaultProvider(): string | null {
  return useSyncExternalStore(
    subscribeReferredVaultProvider,
    getReferredVaultProvider,
  );
}
