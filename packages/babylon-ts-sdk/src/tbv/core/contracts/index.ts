/**
 * Smart Contract ABIs and Error Handling
 *
 * Contract ABIs used by the SDK for encoding transaction data,
 * and utilities for handling contract errors.
 *
 * @module contracts
 */

export { ApplicationRegistryABI } from "./abis/ApplicationRegistry.abi";
export { BTCVaultRegistryABI } from "./abis/BTCVaultRegistry.abi";
export { ProtocolParamsABI } from "./abis/ProtocolParams.abi";

export {
  CONTRACT_ERRORS,
  extractErrorData,
  getContractErrorMessage,
  isKnownContractError,
  handleContractError,
} from "./errors";

