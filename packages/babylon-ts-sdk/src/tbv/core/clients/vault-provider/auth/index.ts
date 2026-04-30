/**
 * Vault-provider authentication primitives.
 *
 * @module tbv/core/clients/vault-provider/auth
 */

export { ServerIdentityError, verifyServerIdentity } from "./serverIdentity";
export type {
  ServerIdentityResponse,
  VerifyServerIdentityInput,
} from "./serverIdentity";

export {
  VpTokenRegistry,
  vpTokenRegistry,
  type VpTokenRegistryInput,
} from "./tokenRegistry";

export { createAuthenticatedVpClient } from "./createAuthenticatedVpClient";
export type { AuthenticatedVpClientConfig } from "./createAuthenticatedVpClient";

export { primeVpTokenRegistry } from "./primeVpAuth";
export type { PrimeVpAuthInput } from "./primeVpAuth";
