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

export { VpTokenProvider } from "./tokenProvider";
export type {
  CreateDepositorTokenResponse,
  VpTokenProviderConfig,
} from "./tokenProvider";
