import { VaultProviderRpcClient } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { getVpProxyUrl } from "./vpProxy";

export function createVpClient(
  providerAddress: string,
  options?: ConstructorParameters<typeof VaultProviderRpcClient>[1],
): VaultProviderRpcClient {
  return new VaultProviderRpcClient(getVpProxyUrl(providerAddress), options);
}
